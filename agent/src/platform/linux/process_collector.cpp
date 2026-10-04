#include "internal.hpp"

#include "sentinel/crypto.hpp"
#include "sentinel/platform.hpp"

#include <dirent.h>
#include <pwd.h>
#include <unistd.h>

#include <algorithm>
#include <cctype>
#include <charconv>
#include <fstream>
#include <sstream>
#include <unordered_set>

namespace sentinel::linuxplat {
namespace {

std::vector<std::string> split_ws(const std::string& line) {
  std::istringstream stream(line);
  std::vector<std::string> tokens;
  std::string token;
  while (stream >> token) {
    tokens.push_back(token);
  }
  return tokens;
}

std::string trim(std::string text) {
  while (!text.empty() && (text.back() == '\n' || text.back() == '\r' || text.back() == ' ')) {
    text.pop_back();
  }
  return text;
}

/// /proc/<pid>/stat: "1234 (nome com espacos) S 1 1 ... 22" -> ppid + starttime.
bool parse_stat(const std::string& content, std::uint32_t& ppid, std::uint64_t& starttime) {
  const std::size_t close = content.rfind(')');
  if (close == std::string::npos || close + 1 >= content.size()) {
    return false;
  }
  const auto tokens = split_ws(content.substr(close + 1));
  // tokens[0] = estado, tokens[1] = ppid, tokens[19] = starttime
  if (tokens.size() < 20) {
    return false;
  }
  try {
    ppid = static_cast<std::uint32_t>(std::stoul(tokens[1]));
    starttime = std::stoull(tokens[19]);
  } catch (...) {
    return false;
  }
  return true;
}

std::string lookup_user(std::uint32_t uid) {
  const passwd* record = getpwuid(uid);
  if (record == nullptr || record->pw_name == nullptr) {
    return std::to_string(uid);
  }
  return record->pw_name;
}

std::uint64_t boot_time_seconds() {
  const std::string stat = read_text_file("/proc/stat", 64U * 1024U);
  const std::size_t position = stat.find("btime ");
  if (position == std::string::npos) {
    return 0;
  }
  try {
    return std::stoull(stat.substr(position + 6));
  } catch (...) {
    return 0;
  }
}

}  // namespace

std::string read_text_file(const std::string& path, std::size_t max_bytes) {
  std::ifstream input(path, std::ios::binary);
  if (!input) {
    return {};
  }
  std::string content;
  content.resize(max_bytes);
  input.read(content.data(), static_cast<std::streamsize>(max_bytes));
  content.resize(static_cast<std::size_t>(input.gcount()));
  return content;
}

std::string read_link(const std::string& path) {
  std::vector<char> buffer(4096);
  const ssize_t length = readlink(path.c_str(), buffer.data(), buffer.size() - 1);
  if (length <= 0) {
    return {};
  }
  buffer[static_cast<std::size_t>(length)] = '\0';
  return std::string(buffer.data());
}

std::vector<std::string> list_directory(const std::string& path) {
  std::vector<std::string> entries;
  DIR* directory = opendir(path.c_str());
  if (directory == nullptr) {
    return entries;
  }
  const dirent* entry = nullptr;
  while ((entry = readdir(directory)) != nullptr) {
    const std::string name(entry->d_name);
    if (name == "." || name == "..") {
      continue;
    }
    entries.push_back(name);
  }
  closedir(directory);
  return entries;
}

class ProcessCollector final : public ICollector {
 public:
  explicit ProcessCollector(const Config& config)
      : hash_binaries_(config.hash_binaries), hash_max_bytes_(config.hash_max_bytes) {}

  std::string name() const override { return "process"; }

  std::vector<Event> collect() override {
    std::vector<Event> produced;
    if (boot_time_ == 0) {
      boot_time_ = boot_time_seconds();
    }
    const long ticks = sysconf(_SC_CLK_TCK);
    const auto clock_ticks = ticks > 0 ? static_cast<std::uint64_t>(ticks) : 100ULL;

    for (const auto& entry : list_directory("/proc")) {
      if (!std::all_of(entry.begin(), entry.end(),
                       [](char c) { return std::isdigit(static_cast<unsigned char>(c)) != 0; })) {
        continue;
      }
      std::uint32_t pid = 0;
      const auto parsed = std::from_chars(entry.data(), entry.data() + entry.size(), pid);
      if (parsed.ec != std::errc{} || parsed.ptr != entry.data() + entry.size()) {
        continue;
      }
      if (seen_.find(pid) != seen_.end()) {
        continue;  // coleta incremental
      }

      const std::string base = "/proc/" + entry;
      const std::string stat_content = read_text_file(base + "/stat", 8U * 1024U);
      if (stat_content.empty()) {
        continue;  // processo saiu entre o readdir e a leitura
      }
      std::uint32_t ppid = 0;
      std::uint64_t starttime = 0;
      if (!parse_stat(stat_content, ppid, starttime)) {
        continue;
      }
      seen_.insert(pid);

      Event event;
      event.type = "process";
      event.timestamp = std::chrono::system_clock::now();

      nlohmann::json data;
      data["pid"] = pid;
      data["ppid"] = ppid;
      data["name"] = trim(read_text_file(base + "/comm", 256U));

      const std::string status = read_text_file(base + "/status", 8U * 1024U);
      const std::size_t uid_pos = status.find("Uid:");
      if (uid_pos != std::string::npos) {
        const auto line = status.substr(uid_pos, status.find('\n', uid_pos) - uid_pos);
        const auto tokens = split_ws(line);
        if (tokens.size() >= 2) {
          try {
            data["user"] = lookup_user(static_cast<std::uint32_t>(std::stoul(tokens[1])));
          } catch (...) {
            data["user"] = nullptr;
          }
        }
      }

      const std::string path = read_link(base + "/exe");
      data["path"] = path.empty() ? nlohmann::json(nullptr) : nlohmann::json(path);

      if (boot_time_ > 0 && starttime > 0) {
        const auto seconds = boot_time_ + starttime / clock_ticks;
        data["started_at"] =
            iso8601_utc(std::chrono::system_clock::time_point(std::chrono::seconds(seconds)));
      }

      if (hash_binaries_ && !path.empty()) {
        std::string digest;
        if (crypto::sha256_file_hex(path, hash_max_bytes_, digest)) {
          data["sha256"] = digest;
        }
      }

      event.data = std::move(data);
      produced.push_back(std::move(event));
    }
    return produced;
  }

 private:
  bool hash_binaries_;
  std::size_t hash_max_bytes_;
  std::uint64_t boot_time_ = 0;
  std::unordered_set<std::uint32_t> seen_;
};

CollectorPtr make_process_collector(const Config& config) {
  return std::make_unique<ProcessCollector>(config);
}

}  // namespace sentinel::linuxplat
