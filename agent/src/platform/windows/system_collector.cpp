#include "internal.hpp"

#include "sentinel/platform.hpp"

#include <array>
#include <cwchar>
#include <vector>

namespace sentinel::win {
namespace {

std::uint64_t filetime_value(const FILETIME& filetime) {
  ULARGE_INTEGER value{};
  value.LowPart = filetime.dwLowDateTime;
  value.HighPart = filetime.dwHighDateTime;
  return value.QuadPart;
}

}  // namespace

class SystemCollector final : public ICollector {
 public:
  std::string name() const override { return "system"; }

  std::vector<Event> collect() override {
    Event event;
    event.type = "system";
    event.timestamp = std::chrono::system_clock::now();

    nlohmann::json data;
    data["hostname"] = host_hostname();
    data["os"] = host_os_name();
    data["arch"] = host_arch();
    data["os_version"] =
        registry_value(L"SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion", L"DisplayVersion");
    data["uptime_seconds"] = static_cast<std::uint64_t>(GetTickCount64() / 1000ULL);

    MEMORYSTATUSEX memory{};
    memory.dwLength = sizeof(memory);
    if (GlobalMemoryStatusEx(&memory)) {
      data["memory"] = {{"load_percent", static_cast<double>(memory.dwMemoryLoad)},
                        {"total_bytes", static_cast<std::uint64_t>(memory.ullTotalPhys)},
                        {"available_bytes", static_cast<std::uint64_t>(memory.ullAvailPhys)}};
    }

    nlohmann::json cpu = nlohmann::json::object();
    SYSTEM_INFO info{};
    GetNativeSystemInfo(&info);
    cpu["logical_cores"] = static_cast<std::uint32_t>(info.dwNumberOfProcessors);
    switch (info.wProcessorArchitecture) {
      case PROCESSOR_ARCHITECTURE_AMD64:
        cpu["architecture"] = "x86_64";
        break;
      case PROCESSOR_ARCHITECTURE_ARM64:
        cpu["architecture"] = "aarch64";
        break;
      case PROCESSOR_ARCHITECTURE_INTEL:
        cpu["architecture"] = "x86";
        break;
      default:
        cpu["architecture"] = "unknown";
        break;
    }

    FILETIME idle{};
    FILETIME kernel{};
    FILETIME user{};
    if (GetSystemTimes(&idle, &kernel, &user)) {
      const std::uint64_t idle_ticks = filetime_value(idle);
      const std::uint64_t kernel_ticks = filetime_value(kernel);
      const std::uint64_t user_ticks = filetime_value(user);
      if (has_previous_sample_) {
        const std::uint64_t delta_idle = idle_ticks - previous_idle_;
        const std::uint64_t delta_kernel = kernel_ticks - previous_kernel_;
        const std::uint64_t delta_user = user_ticks - previous_user_;
        const std::uint64_t total = delta_kernel + delta_user;
        if (total > 0) {
          const double busy = static_cast<double>(total - delta_idle);
          cpu["load_percent"] = 100.0 * busy / static_cast<double>(total);
        }
      } else {
        has_previous_sample_ = true;
      }
      previous_idle_ = idle_ticks;
      previous_kernel_ = kernel_ticks;
      previous_user_ = user_ticks;
    }
    data["cpu"] = std::move(cpu);

    nlohmann::json disks = nlohmann::json::array();
    const DWORD length = GetLogicalDriveStringsW(0, nullptr);
    if (length > 0) {
      std::vector<wchar_t> drives(static_cast<std::size_t>(length) + 2, L'\0');
      if (GetLogicalDriveStringsW(static_cast<DWORD>(drives.size()), drives.data()) > 0) {
        for (const wchar_t* drive = drives.data(); *drive != L'\0'; drive += wcslen(drive) + 1) {
          if (GetDriveTypeW(drive) != DRIVE_FIXED) continue;
          ULARGE_INTEGER free_bytes{};
          ULARGE_INTEGER total_bytes{};
          if (GetDiskFreeSpaceExW(drive, &free_bytes, &total_bytes, nullptr)) {
            disks.push_back({{"path", wide_to_utf8(std::wstring(drive))},
                             {"total_bytes", static_cast<std::uint64_t>(total_bytes.QuadPart)},
                             {"free_bytes", static_cast<std::uint64_t>(free_bytes.QuadPart)}});
          }
        }
      }
    }
    data["disk"] = std::move(disks);

    event.data = std::move(data);
    return {std::move(event)};
  }

 private:
  bool has_previous_sample_ = false;
  std::uint64_t previous_idle_ = 0;
  std::uint64_t previous_kernel_ = 0;
  std::uint64_t previous_user_ = 0;
};

CollectorPtr make_system_collector(const Config& config) {
  static_cast<void>(config);
  return std::make_unique<SystemCollector>();
}

}  // namespace sentinel::win
