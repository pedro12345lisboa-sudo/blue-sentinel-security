#include "internal.hpp"

#include "sentinel/platform.hpp"

#include <algorithm>

namespace sentinel {

std::vector<CollectorPtr> create_platform_collectors(const Config& config) {
  std::vector<CollectorPtr> collectors;
  collectors.push_back(win::make_process_collector(config));
  collectors.push_back(win::make_eventlog_collector(config));
  collectors.push_back(win::make_network_collector(config));
  collectors.push_back(win::make_system_collector(config));

  collectors.erase(std::remove_if(collectors.begin(), collectors.end(),
                                  [&config](const CollectorPtr& collector) {
                                    return std::find(config.disabled_collectors.begin(),
                                                     config.disabled_collectors.end(),
                                                     collector->name()) !=
                                           config.disabled_collectors.end();
                                  }),
                   collectors.end());
  return collectors;
}

}  // namespace sentinel
