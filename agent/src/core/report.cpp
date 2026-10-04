#include "sentinel/report.hpp"

#include "sentinel/version.hpp"

#include <map>

namespace sentinel {

nlohmann::json build_report(const std::vector<Event>& events,
                            const std::string& hostname,
                            const std::string& os_name,
                            const std::string& arch) {
  std::map<std::string, std::size_t> counts;
  nlohmann::json event_array = nlohmann::json::array();
  for (const auto& event : events) {
    ++counts[event.type];
    event_array.push_back(to_json(event));
  }

  nlohmann::json by_type = nlohmann::json::object();
  for (const auto& [type, count] : counts) {
    by_type[type] = count;
  }

  nlohmann::json report;
  report["schema_version"] = kSchemaVersion;
  report["agent"] = {{"name", kAgentName}, {"version", kVersion}};
  report["host"] = {{"hostname", hostname}, {"os", os_name}, {"arch", arch}};
  report["collected_at"] = iso8601_utc(std::chrono::system_clock::now());
  report["event_count"] = events.size();
  report["events_by_type"] = by_type;
  report["events"] = std::move(event_array);
  return report;
}

std::string serialize_report(const nlohmann::json& report, const ReportOptions& options) {
  return options.pretty ? report.dump(2) : report.dump();
}

}  // namespace sentinel
