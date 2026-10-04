#include "internal.hpp"

#include "sentinel/logger.hpp"

#include <fstream>
#include <sstream>
#include <sys/stat.h>

namespace sentinel::linuxplat {
namespace {

constexpr std::size_t kMaxReadBytes = 256U * 1024U;

struct FilePosition {
  std::uint64_t offset = 0;
  std::uint64_t inode = 0;
  std::string partial;
  bool warned = false;
};

struct SyslogLine {
  bool valid = false;
  std::string month;
  std::string day;
  std::string time;
  std::string host;
  std::string program;
  std::string pid;
  std::string message;
};

std::uint64_t file_size(const std::string& path) {
  struct stat info {};
  if (stat(path.c_str(), &info) != 0) {
    return 0;
  }
  return static_cast<std::uint64_t>(info.st_size);
}

std::uint64_t file_inode(const std::string& path) {
  struct stat info {};
  if (stat(path.c_str(), &info) != 0) {
    return 0;
  }
  return static_cast<std::uint64_t>(info.st_ino);
}

/// RFC3164: "Oct  3 12:34:56 host prog[123]: mensagem"
SyslogLine parse_syslog(const std::string& line) {
  SyslogLine parsed;
  std::istringstream stream(line);
  if (!(stream >> parsed.month >> parsed.day >> parsed.time >> parsed.host)) {
    return parsed;
  }
  std::string rest;
  std::getline(stream, rest);
  if (!rest.empty() && rest.front() == ' ') {
    rest.erase(rest.begin());
  }
  if (rest.empty()) {
    return parsed;
  }

  const std::size_t bracket = rest.find('[');
  const std::size_t colon = rest.find(": ");
  if (bracket != std::string::npos && colon != std::string::npos && bracket < colon) {
    parsed.program = rest.substr(0, bracket);
    const std::size_t close = rest.find(']', bracket);
    if (close != std::string::npos && close > bracket + 1) {
      parsed.pid = rest.substr(bracket + 1, close - bracket - 1);
    }
    if (close != std::string::npos && close + 1 < rest.size()) {
      const std::size_t start = rest.find(": ", close);
      if (start != std::string::npos) {
        parsed.message = rest.substr(start + 2);
      }
    }
  } else if (colon != std::string::npos) {
    parsed.program = rest.substr(0, colon);
    parsed.message = rest.substr(colon + 2);
  } else {
    parsed.message = rest;
  }
  parsed.valid = true;
  return parsed;
}

}  // namespace

class AuthLogCollector final : public ICollector {
 public:
  explicit AuthLogCollector(const Config& config) : max_lines_(config.eventlog_max_events) {}

  std::string name() const override { return "auth_log"; }

  std::vector<Event> collect() override {
    std::vector<Event> produced;
    for (const auto& path : {std::string("/var/log/auth.log"), std::string("/var/log/secure")}) {
      if (produced.size() >= max_lines_) break;
      collect_file(path, produced);
    }
    return produced;
  }

 private:
  void collect_file(const std::string& path, std::vector<Event>& produced) {
    const std::uint64_t size = file_size(path);
    if (size == 0) {
      return;
    }
    FilePosition& position = positions_[path];
    if (position.inode != 0 && file_inode(path) != position.inode) {
      position.offset = 0;  // rotação do log
      position.partial.clear();
    }
    position.inode = file_inode(path);
    if (size < position.offset) {
      position.offset = 0;
      position.partial.clear();
    }
    if (size == position.offset) {
      return;
    }

    std::ifstream input(path, std::ios::binary);
    if (!input) {
      if (!position.warned) {
        position.warned = true;
        log_warn("sem permissão para ler " + path +
                 " (exige root ou grupo adm/systemd-journal); coletor segue vazio");
      }
      return;
    }
    input.seekg(static_cast<std::streamoff>(position.offset));

    std::string chunk;
    chunk.resize(kMaxReadBytes);
    input.read(chunk.data(), static_cast<std::streamsize>(chunk.size()));
    const auto got = static_cast<std::size_t>(input.gcount());
    chunk.resize(got);

    std::string buffer = std::move(position.partial);
    buffer += chunk;

    std::size_t start = 0;
    while (produced.size() < max_lines_) {
      const std::size_t newline = buffer.find('\n', start);
      if (newline == std::string::npos) {
        break;
      }
      const std::string line = buffer.substr(start, newline - start);
      start = newline + 1;
      if (!line.empty()) {
        Event event = build_event(path, line);
        produced.push_back(std::move(event));
      }
    }

    // Offset avança só até o fim da última linha completa (o partial fica
    // pendente e será relido na próxima coleta).
    position.offset += start;
    position.partial = buffer.substr(start);
    if (position.partial.size() > 64U * 1024U) {
      log_warn("linha anormalmente longa descartada em " + path);
      position.partial.clear();
    }
  }

  Event build_event(const std::string& source, const std::string& line) {
    const SyslogLine parsed = parse_syslog(line);

    Event event;
    event.type = "auth";
    event.timestamp = std::chrono::system_clock::now();

    nlohmann::json data;
    data["source"] = source;
    data["time_raw"] = parsed.month + " " + parsed.day + " " + parsed.time;
    data["host"] = parsed.host;
    data["program"] = parsed.program;
    if (!parsed.pid.empty()) data["pid"] = parsed.pid;
    data["message"] = parsed.message;
    data["line"] = line;
    if (!parsed.valid) data["unparsed"] = true;

    event.data = std::move(data);
    return event;
  }

  std::size_t max_lines_;
  std::map<std::string, FilePosition> positions_;
};

CollectorPtr make_auth_log_collector(const Config& config) {
  return std::make_unique<AuthLogCollector>(config);
}

}  // namespace sentinel::linuxplat
