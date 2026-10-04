#include "internal.hpp"

#include "sentinel/crypto.hpp"
#include "sentinel/platform.hpp"

#include <tlhelp32.h>

#include <unordered_set>
#include <vector>

namespace sentinel::win {
namespace {

std::string process_path(HANDLE process) {
  std::vector<wchar_t> buffer(32768);
  DWORD size = static_cast<DWORD>(buffer.size());
  if (!QueryFullProcessImageNameW(process, 0, buffer.data(), &size)) {
    return {};
  }
  buffer.resize(size);
  return wide_to_utf8(std::wstring(buffer.data(), size));
}

std::string process_user(HANDLE process) {
  ScopedHandle token;
  HANDLE raw = nullptr;
  if (!OpenProcessToken(process, TOKEN_QUERY, &raw)) {
    return {};
  }
  token.reset(raw);

  DWORD size = 0;
  GetTokenInformation(token.get(), TokenUser, nullptr, 0, &size);
  if (GetLastError() != ERROR_INSUFFICIENT_BUFFER || size == 0) {
    return {};
  }
  std::vector<BYTE> buffer(size);
  if (!GetTokenInformation(token.get(), TokenUser, buffer.data(), size, &size)) {
    return {};
  }

  auto* user = reinterpret_cast<TOKEN_USER*>(buffer.data());
  if (user == nullptr || user->User.Sid == nullptr) {
    return {};
  }

  DWORD name_length = 0;
  DWORD domain_length = 0;
  SID_NAME_USE use = SidTypeUnknown;
  LookupAccountSidW(nullptr, user->User.Sid, nullptr, &name_length, nullptr, &domain_length, &use);
  if (GetLastError() != ERROR_INSUFFICIENT_BUFFER || name_length == 0) {
    return {};
  }
  std::wstring name(name_length, L'\0');
  std::wstring domain(domain_length, L'\0');
  if (!LookupAccountSidW(nullptr, user->User.Sid, name.data(), &name_length, domain.data(),
                         &domain_length, &use)) {
    return {};
  }
  while (!name.empty() && name.back() == L'\0') name.pop_back();
  while (!domain.empty() && domain.back() == L'\0') domain.pop_back();

  if (domain.empty()) {
    return wide_to_utf8(name);
  }
  return wide_to_utf8(domain + L"\\" + name);
}

std::chrono::system_clock::time_point filetime_to_timepoint(const FILETIME& filetime) {
  ULARGE_INTEGER ticks{};
  ticks.LowPart = filetime.dwLowDateTime;
  ticks.HighPart = filetime.dwHighDateTime;
  constexpr std::uint64_t kEpochDiff = 116444736000000000ULL;  // 1601 -> 1970
  if (ticks.QuadPart < kEpochDiff) {
    return {};
  }
  const std::uint64_t micros = (ticks.QuadPart - kEpochDiff) / 10ULL;
  return std::chrono::system_clock::time_point(std::chrono::microseconds(micros));
}

}  // namespace

std::string wide_to_utf8(const std::wstring& wide) {
  if (wide.empty()) {
    return {};
  }
  const int needed =
      WideCharToMultiByte(CP_UTF8, 0, wide.data(), static_cast<int>(wide.size()), nullptr, 0,
                          nullptr, nullptr);
  if (needed <= 0) {
    return {};
  }
  std::string out(static_cast<std::size_t>(needed), '\0');
  WideCharToMultiByte(CP_UTF8, 0, wide.data(), static_cast<int>(wide.size()), out.data(), needed,
                      nullptr, nullptr);
  return out;
}

std::wstring utf8_to_wide(const std::string& utf8) {
  if (utf8.empty()) {
    return {};
  }
  const int needed =
      MultiByteToWideChar(CP_UTF8, 0, utf8.data(), static_cast<int>(utf8.size()), nullptr, 0);
  if (needed <= 0) {
    return {};
  }
  std::wstring out(static_cast<std::size_t>(needed), L'\0');
  MultiByteToWideChar(CP_UTF8, 0, utf8.data(), static_cast<int>(utf8.size()), out.data(), needed);
  return out;
}

std::string win_error_message(DWORD code) {
  wchar_t* buffer = nullptr;
  const DWORD length =
      FormatMessageW(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM |
                         FORMAT_MESSAGE_IGNORE_INSERTS,
                     nullptr, code, MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),
                     reinterpret_cast<wchar_t*>(&buffer), 0, nullptr);
  std::wstring message;
  if (length != 0 && buffer != nullptr) {
    message.assign(buffer, length);
    LocalFree(buffer);
    while (!message.empty() && (message.back() == L'\r' || message.back() == L'\n' ||
                                message.back() == L' ')) {
      message.pop_back();
    }
  } else {
    message = L"erro " + std::to_wstring(code);
  }
  return wide_to_utf8(message);
}

std::map<std::uint32_t, std::string> snapshot_process_names() {
  std::map<std::uint32_t, std::string> names;
  ScopedHandle snapshot(CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0));
  if (!snapshot) {
    return names;
  }
  PROCESSENTRY32W entry{};
  entry.dwSize = sizeof(entry);
  if (!Process32FirstW(snapshot.get(), &entry)) {
    return names;
  }
  do {
    names.emplace(entry.th32ProcessID, wide_to_utf8(entry.szExeFile));
  } while (Process32NextW(snapshot.get(), &entry));
  return names;
}

class ProcessCollector final : public ICollector {
 public:
  explicit ProcessCollector(const Config& config) : hash_binaries_(config.hash_binaries),
                                                    hash_max_bytes_(config.hash_max_bytes) {}

  std::string name() const override { return "process"; }

  std::vector<Event> collect() override {
    std::vector<Event> produced;
    ScopedHandle snapshot(CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0));
    if (!snapshot) {
      return produced;
    }

    PROCESSENTRY32W entry{};
    entry.dwSize = sizeof(entry);
    if (!Process32FirstW(snapshot.get(), &entry)) {
      return produced;
    }

    do {
      const std::uint32_t pid = entry.th32ProcessID;
      if (seen_.find(pid) != seen_.end()) {
        continue;  // coleta incremental: só processos novos no laço
      }
      seen_.insert(pid);

      Event event;
      event.type = "process";
      event.timestamp = std::chrono::system_clock::now();

      nlohmann::json data;
      data["pid"] = pid;
      data["ppid"] = entry.th32ParentProcessID;
      data["name"] = wide_to_utf8(entry.szExeFile);

      ScopedHandle process(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid));
      std::string path;
      if (process) {
        path = process_path(process.get());
        data["path"] = path;
        data["user"] = process_user(process.get());

        FILETIME creation{};
        FILETIME exit{};
        FILETIME kernel{};
        FILETIME user{};
        if (GetProcessTimes(process.get(), &creation, &exit, &kernel, &user)) {
          const auto started = filetime_to_timepoint(creation);
          if (started.time_since_epoch().count() != 0) {
            data["started_at"] = iso8601_utc(started);
          }
        }
      } else {
        data["path"] = nullptr;
        data["user"] = nullptr;
      }

      if (hash_binaries_ && !path.empty()) {
        std::string digest;
        if (crypto::sha256_file_hex(path, hash_max_bytes_, digest)) {
          data["sha256"] = digest;
        }
      }

      event.data = std::move(data);
      produced.push_back(std::move(event));
    } while (Process32NextW(snapshot.get(), &entry));

    return produced;
  }

 private:
  bool hash_binaries_;
  std::size_t hash_max_bytes_;
  std::unordered_set<std::uint32_t> seen_;
};

CollectorPtr make_process_collector(const Config& config) {
  return std::make_unique<ProcessCollector>(config);
}

}  // namespace sentinel::win
