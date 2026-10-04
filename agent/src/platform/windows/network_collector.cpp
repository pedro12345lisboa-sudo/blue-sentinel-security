#include "internal.hpp"

#include "sentinel/logger.hpp"

#include <winsock2.h>

#include <iphlpapi.h>
#include <ws2tcpip.h>

#include <array>
#include <cstring>
#include <map>
#include <vector>

namespace sentinel::win {
namespace {

std::string ipv4_to_string(DWORD address) {
  in_addr addr{};
  addr.s_addr = address;
  std::array<char, INET_ADDRSTRLEN> buffer{};
  if (InetNtopA(AF_INET, &addr, buffer.data(), static_cast<DWORD>(buffer.size())) == nullptr) {
    return {};
  }
  return buffer.data();
}

std::string ipv6_to_string(const BYTE* bytes) {
  in6_addr addr{};
  std::memcpy(&addr, bytes, sizeof(addr));
  std::array<char, INET6_ADDRSTRLEN> buffer{};
  if (InetNtopA(AF_INET6, &addr, buffer.data(), static_cast<DWORD>(buffer.size())) == nullptr) {
    return {};
  }
  return buffer.data();
}

const char* tcp_state_name(DWORD state) {
  switch (state) {
    case MIB_TCP_STATE_CLOSED:
      return "closed";
    case MIB_TCP_STATE_LISTEN:
      return "listen";
    case MIB_TCP_STATE_SYN_SENT:
      return "syn_sent";
    case MIB_TCP_STATE_SYN_RCVD:
      return "syn_recv";
    case MIB_TCP_STATE_ESTAB:
      return "established";
    case MIB_TCP_STATE_FIN_WAIT1:
      return "fin_wait1";
    case MIB_TCP_STATE_FIN_WAIT2:
      return "fin_wait2";
    case MIB_TCP_STATE_TIME_WAIT:
      return "time_wait";
    case MIB_TCP_STATE_CLOSE_WAIT:
      return "close_wait";
    case MIB_TCP_STATE_LAST_ACK:
      return "last_ack";
    case MIB_TCP_STATE_CLOSING:
      return "closing";
    default:
      return "unknown";
  }
}

}  // namespace

class NetworkCollector final : public ICollector {
 public:
  std::string name() const override { return "network"; }

  std::vector<Event> collect() override {
    std::vector<Event> produced;
    const auto names = snapshot_process_names();
    collect_family(AF_INET, names, produced);
    collect_family(AF_INET6, names, produced);
    return produced;
  }

 private:
  void collect_family(DWORD family,
                      const std::map<std::uint32_t, std::string>& names,
                      std::vector<Event>& produced) {
    ULONG size = 0;
    DWORD status = GetExtendedTcpTable(nullptr, &size, FALSE, family, TCP_TABLE_OWNER_PID_ALL, 0);
    if (status != ERROR_INSUFFICIENT_BUFFER || size == 0) {
      if (status != NO_ERROR) {
        log_warn("GetExtendedTcpTable: " + win_error_message(status));
      }
      return;
    }

    std::vector<BYTE> buffer(size);
    status = GetExtendedTcpTable(buffer.data(), &size, FALSE, family, TCP_TABLE_OWNER_PID_ALL, 0);
    if (status != NO_ERROR) {
      log_warn("GetExtendedTcpTable: " + win_error_message(status));
      return;
    }

    if (family == AF_INET) {
      auto* table = reinterpret_cast<MIB_TCPTABLE_OWNER_PID*>(buffer.data());
      if (table == nullptr || table->dwNumEntries == 0) return;
      for (DWORD i = 0; i < table->dwNumEntries; ++i) {
        const auto& row = table->table[i];
        Event event;
        event.type = "network_connection";
        event.timestamp = std::chrono::system_clock::now();
        nlohmann::json data;
        data["family"] = "ipv4";
        data["local_addr"] = ipv4_to_string(row.dwLocalAddr);
        data["local_port"] = ntohs(static_cast<u_short>(row.dwLocalPort));
        data["remote_addr"] = ipv4_to_string(row.dwRemoteAddr);
        data["remote_port"] = ntohs(static_cast<u_short>(row.dwRemotePort));
        data["state"] = tcp_state_name(row.dwState);
        data["pid"] = row.dwOwningPid;
        const auto it = names.find(row.dwOwningPid);
        data["process"] = it == names.end() ? nlohmann::json(nullptr) : nlohmann::json(it->second);
        event.data = std::move(data);
        produced.push_back(std::move(event));
      }
      return;
    }

    auto* table6 = reinterpret_cast<MIB_TCP6TABLE_OWNER_PID*>(buffer.data());
    if (table6 == nullptr || table6->dwNumEntries == 0) return;
    for (DWORD i = 0; i < table6->dwNumEntries; ++i) {
      const auto& row = table6->table[i];
      Event event;
      event.type = "network_connection";
      event.timestamp = std::chrono::system_clock::now();
      nlohmann::json data;
      data["family"] = "ipv6";
      data["local_addr"] = ipv6_to_string(row.ucLocalAddr);
      data["local_port"] = ntohs(static_cast<u_short>(row.dwLocalPort));
      data["remote_addr"] = ipv6_to_string(row.ucRemoteAddr);
      data["remote_port"] = ntohs(static_cast<u_short>(row.dwRemotePort));
      data["state"] = tcp_state_name(row.dwState);
      data["pid"] = row.dwOwningPid;
      const auto it = names.find(row.dwOwningPid);
      data["process"] = it == names.end() ? nlohmann::json(nullptr) : nlohmann::json(it->second);
      event.data = std::move(data);
      produced.push_back(std::move(event));
    }
  }
};

CollectorPtr make_network_collector(const Config& config) {
  static_cast<void>(config);
  return std::make_unique<NetworkCollector>();
}

}  // namespace sentinel::win
