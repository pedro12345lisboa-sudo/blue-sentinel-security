#include "internal.hpp"

#include "sentinel/platform.hpp"

#include <arpa/inet.h>
#include <unistd.h>

#include <array>
#include <charconv>
#include <cstring>
#include <set>
#include <sstream>

namespace sentinel::linuxplat {
namespace {

constexpr std::size_t kMaxSocketOwners = 4096;

std::string trim(std::string text) {
  while (!text.empty() && (text.back() == '\n' || text.back() == '\r')) text.pop_back();
  return text;
}

std::vector<std::string> split_ws(const std::string& line) {
  std::istringstream stream(line);
  std::vector<std::string> tokens;
  std::string token;
  while (stream >> token) tokens.push_back(token);
  return tokens;
}

bool hex_pair(const std::string& text, std::size_t position, unsigned char& out) {
  if (position + 1 >= text.size()) return false;
  const auto nibble = [](char c) -> int {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
  };
  const int high = nibble(text[position]);
  const int low = nibble(text[position + 1]);
  if (high < 0 || low < 0) return false;
  out = static_cast<unsigned char>((high << 4) | low);
  return true;
}

/// /proc guarda cada dword em little-endian; os bytes de rede são o inverso.
std::string ipv4_from_hex(const std::string& hex) {
  if (hex.size() != 8) return {};
  in_addr addr{};
  auto* raw = reinterpret_cast<unsigned char*>(&addr.s_addr);
  for (std::size_t i = 0; i < 4; ++i) {
    unsigned char byte = 0;
    if (!hex_pair(hex, i * 2, byte)) return {};
    raw[3 - i] = byte;
  }
  char buffer[INET_ADDRSTRLEN]{};
  if (inet_ntop(AF_INET, &addr, buffer, sizeof(buffer)) == nullptr) return {};
  return buffer;
}

std::string ipv6_from_hex(const std::string& hex) {
  if (hex.size() != 32) return {};
  std::array<unsigned char, 16> bytes{};
  for (std::size_t word = 0; word < 4; ++word) {
    for (std::size_t i = 0; i < 4; ++i) {
      unsigned char byte = 0;
      if (!hex_pair(hex, word * 8 + i * 2, byte)) return {};
      // Cada dword aparece em little-endian: byte i do texto = byte (3-i) do endereço
      bytes[word * 4 + (3 - i)] = byte;
    }
  }
  in6_addr addr{};
  std::memcpy(&addr, bytes.data(), bytes.size());
  char buffer[INET6_ADDRSTRLEN]{};
  if (inet_ntop(AF_INET6, &addr, buffer, sizeof(buffer)) == nullptr) return {};
  return buffer;
}

bool port_from_hex(const std::string& hex, int& out) {
  if (hex.size() != 4) return false;
  unsigned char high = 0;
  unsigned char low = 0;
  if (!hex_pair(hex, 0, high) || !hex_pair(hex, 2, low)) return false;
  out = (static_cast<int>(high) << 8) | static_cast<int>(low);
  return true;
}

bool uid_from_hex(const std::string& hex, std::uint32_t& out) {
  const auto parsed = std::from_chars(hex.data(), hex.data() + hex.size(), out, 16);
  return parsed.ec == std::errc{} && parsed.ptr == hex.data() + hex.size();
}

std::string state_from_hex(const std::string& hex) {
  if (hex == "01") return "established";
  if (hex == "02") return "syn_sent";
  if (hex == "03") return "syn_recv";
  if (hex == "04") return "fin_wait1";
  if (hex == "05") return "fin_wait2";
  if (hex == "06") return "time_wait";
  if (hex == "07") return "close";
  if (hex == "08") return "close_wait";
  if (hex == "09") return "last_ack";
  if (hex == "0A" || hex == "0a") return "listen";
  if (hex == "0B" || hex == "0b") return "closing";
  return "unknown";
}

/// Mapeia inode -> (pid, comm) varrendo /proc/<pid>/fd (só os inodes pedidos).
std::map<std::string, std::pair<std::uint32_t, std::string>> socket_owners(
    const std::set<std::string>& inodes) {
  std::map<std::string, std::pair<std::uint32_t, std::string>> owners;
  if (inodes.empty()) {
    return owners;
  }
  std::size_t scanned = 0;
  for (const auto& entry : list_directory("/proc")) {
    if (scanned >= kMaxSocketOwners) break;
    bool numeric = !entry.empty();
    for (const char c : entry) {
      if (c < '0' || c > '9') { numeric = false; break; }
    }
    if (!numeric) continue;
    ++scanned;

    std::uint32_t pid = 0;
    const auto parsed = std::from_chars(entry.data(), entry.data() + entry.size(), pid);
    if (parsed.ec != std::errc{}) continue;

    const std::string comm = trim(read_text_file("/proc/" + entry + "/comm", 256U));
    for (const auto& fd : list_directory("/proc/" + entry + "/fd")) {
      const std::string target = read_link("/proc/" + entry + "/fd/" + fd);
      const std::size_t open = target.find("socket:[");
      if (open == std::string::npos) continue;
      const std::size_t close = target.find(']', open);
      if (close == std::string::npos) continue;
      const std::string inode = target.substr(open + 8, close - open - 8);
      if (inodes.count(inode) != 0) {
        owners.emplace(inode, std::make_pair(pid, comm));
      }
    }
  }
  return owners;
}

}  // namespace

class NetworkCollector final : public ICollector {
 public:
  std::string name() const override { return "network"; }

  std::vector<Event> collect() override {
    std::vector<Event> produced;
    const auto ipv4_rows = parse_table("/proc/net/tcp", "ipv4", produced);
    const auto ipv6_rows = parse_table("/proc/net/tcp6", "ipv6", produced);

    std::set<std::string> inodes;
    for (const auto& row : ipv4_rows) inodes.insert(row);
    for (const auto& row : ipv6_rows) inodes.insert(row);
    const auto owners = socket_owners(inodes);

    for (auto& event : produced) {
      const auto inode = event.data.value("inode", std::string{});
      const auto it = owners.find(inode);
      if (it != owners.end()) {
        event.data["pid"] = it->second.first;
        event.data["process"] = it->second.second;
      } else {
        event.data["pid"] = nullptr;
        event.data["process"] = nullptr;
      }
    }
    return produced;
  }

 private:
  std::vector<std::string> parse_table(const std::string& path, const std::string& family,
                                       std::vector<Event>& produced) {
    std::vector<std::string> inodes;
    const std::string content = read_text_file(path, 1024U * 1024U);
    if (content.empty()) {
      return inodes;
    }

    std::istringstream stream(content);
    std::string line;
    std::getline(stream, line);  // cabeçalho
    while (std::getline(stream, line)) {
      const auto tokens = split_ws(line);
      if (tokens.size() < 10) continue;

      Event event;
      event.type = "network_connection";
      event.timestamp = std::chrono::system_clock::now();

      nlohmann::json data;
      data["family"] = family;
      const auto colon = tokens[1].find(':');
      const auto remote_colon = tokens[2].find(':');
      if (colon == std::string::npos || remote_colon == std::string::npos) continue;
      int local_port = 0;
      int remote_port = 0;
      if (!port_from_hex(tokens[1].substr(colon + 1), local_port) ||
          !port_from_hex(tokens[2].substr(remote_colon + 1), remote_port)) {
        continue;
      }
      std::uint32_t uid = 0;
      data["local_addr"] = family == "ipv4" ? ipv4_from_hex(tokens[1].substr(0, colon))
                                            : ipv6_from_hex(tokens[1].substr(0, colon));
      data["local_port"] = local_port;
      data["remote_addr"] = family == "ipv4" ? ipv4_from_hex(tokens[2].substr(0, remote_colon))
                                            : ipv6_from_hex(tokens[2].substr(0, remote_colon));
      data["remote_port"] = remote_port;
      data["state"] = state_from_hex(tokens[3]);
      if (uid_from_hex(tokens[7], uid)) data["uid"] = uid;
      data["inode"] = tokens[9];

      event.data = std::move(data);
      inodes.push_back(tokens[9]);
      produced.push_back(std::move(event));
    }
    return inodes;
  }
};

CollectorPtr make_network_collector(const Config& config) {
  static_cast<void>(config);
  return std::make_unique<NetworkCollector>();
}

}  // namespace sentinel::linuxplat
