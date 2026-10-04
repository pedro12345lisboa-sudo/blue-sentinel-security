#include "internal.hpp"

#include "sentinel/platform.hpp"

#include <sys/statvfs.h>
#include <sys/utsname.h>
#include <unistd.h>

#include <sstream>

namespace sentinel::linuxplat {
namespace {

double cpu_load_percent(std::uint64_t& previous_idle, std::uint64_t& previous_total,
                        bool& has_previous) {
  const std::string stat = read_text_file("/proc/stat", 8U * 1024U);
  std::istringstream stream(stat);
  std::string label;
  if (!(stream >> label) || label != "cpu") {
    return -1.0;
  }
  std::uint64_t user = 0;
  std::uint64_t nice = 0;
  std::uint64_t system = 0;
  std::uint64_t idle = 0;
  std::uint64_t iowait = 0;
  std::uint64_t irq = 0;
  std::uint64_t softirq = 0;
  std::uint64_t steal = 0;
  stream >> user >> nice >> system >> idle >> iowait >> irq >> softirq >> steal;

  const std::uint64_t idle_total = idle + iowait;
  const std::uint64_t total = user + nice + system + idle + iowait + irq + softirq + steal;
  if (!has_previous) {
    has_previous = true;
    previous_idle = idle_total;
    previous_total = total;
    return -1.0;
  }
  const std::uint64_t delta_idle = idle_total - previous_idle;
  const std::uint64_t delta_total = total - previous_total;
  previous_idle = idle_total;
  previous_total = total;
  if (delta_total == 0) {
    return -1.0;
  }
  const double busy = static_cast<double>(delta_total - delta_idle);
  return 100.0 * busy / static_cast<double>(delta_total);
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

    const std::string uptime = read_text_file("/proc/uptime", 1024U);
    const std::size_t space = uptime.find(' ');
    if (space != std::string::npos) {
      try {
        const double seconds = std::stod(uptime.substr(0, space));
        data["uptime_seconds"] = static_cast<std::uint64_t>(seconds);
      } catch (...) {
        data["uptime_seconds"] = nullptr;
      }
    }

    const std::string meminfo = read_text_file("/proc/meminfo", 16U * 1024U);
    auto mem_field = [&](const char* key) -> std::uint64_t {
      const std::string needle = std::string(key) + ":";
      const std::size_t position = meminfo.find(needle);
      if (position == std::string::npos) return 0;
      std::istringstream stream(meminfo.substr(position + needle.size()));
      std::uint64_t kibibytes = 0;
      stream >> kibibytes;
      return kibibytes * 1024ULL;
    };
    const std::uint64_t mem_total = mem_field("MemTotal");
    const std::uint64_t mem_available = mem_field("MemAvailable");
    nlohmann::json memory;
    memory["total_bytes"] = mem_total;
    memory["available_bytes"] = mem_available;
    if (mem_total > 0) {
      const double used = static_cast<double>(mem_total - mem_available);
      memory["load_percent"] = 100.0 * used / static_cast<double>(mem_total);
    } else {
      memory["load_percent"] = nullptr;
    }
    data["memory"] = std::move(memory);

    nlohmann::json cpu;
    cpu["logical_cores"] = static_cast<std::uint32_t>(sysconf(_SC_NPROCESSORS_ONLN));
    const double load = cpu_load_percent(previous_idle_, previous_total_, has_previous_);
    if (load >= 0.0) {
      cpu["load_percent"] = load;
    }
    data["cpu"] = std::move(cpu);

    struct statvfs stats {};
    if (statvfs("/", &stats) == 0 && stats.f_frsize > 0) {
      const std::uint64_t total = static_cast<std::uint64_t>(stats.f_blocks) * stats.f_frsize;
      const std::uint64_t free = static_cast<std::uint64_t>(stats.f_bfree) * stats.f_frsize;
      data["disk"] = nlohmann::json::array({{{"path", "/"},
                                             {"total_bytes", total},
                                             {"free_bytes", free}}});
    }

    event.data = std::move(data);
    return {std::move(event)};
  }

 private:
  bool has_previous_ = false;
  std::uint64_t previous_idle_ = 0;
  std::uint64_t previous_total_ = 0;
};

CollectorPtr make_system_collector(const Config& config) {
  static_cast<void>(config);
  return std::make_unique<SystemCollector>();
}

}  // namespace sentinel::linuxplat
