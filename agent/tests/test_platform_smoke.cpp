#include <gtest/gtest.h>

#include "sentinel/config.hpp"
#include "sentinel/event.hpp"
#include "sentinel/platform.hpp"

#include <set>
#include <string>

namespace {

TEST(PlatformSmoke, FactoryYieldsNamedUniqueCollectors) {
  const sentinel::Config config;
  auto collectors = sentinel::create_platform_collectors(config);
  ASSERT_FALSE(collectors.empty());

  std::set<std::string> names;
  for (const auto& collector : collectors) {
    ASSERT_NE(collector, nullptr);
    const auto name = collector->name();
    EXPECT_FALSE(name.empty());
    EXPECT_TRUE(names.insert(name).second) << "coletor duplicado: " << name;
  }
}

TEST(PlatformSmoke, DisabledCollectorsAreFiltered) {
  sentinel::Config config;
  config.disabled_collectors = {"process"};
  auto collectors = sentinel::create_platform_collectors(config);
  for (const auto& collector : collectors) {
    EXPECT_NE(collector->name(), "process");
  }
}

TEST(PlatformSmoke, CollectorsDoNotThrowAndProduceWellFormedEvents) {
  const sentinel::Config config;
  for (auto& collector : sentinel::create_platform_collectors(config)) {
    std::vector<sentinel::Event> events;
    EXPECT_NO_THROW(events = collector->collect());
    for (const auto& event : events) {
      EXPECT_FALSE(event.type.empty()) << collector->name();
      EXPECT_TRUE(event.data.is_object() || event.data.is_null())
          << collector->name() << ": " << event.data.dump();
      EXPECT_FALSE(sentinel::iso8601_utc(event.timestamp).empty());
    }
  }
}

TEST(PlatformSmoke, SystemCollectorAlwaysReportsHost) {
  sentinel::Config config;
  bool found_system = false;
  for (auto& collector : sentinel::create_platform_collectors(config)) {
    if (collector->name() != "system") continue;
    const auto events = collector->collect();
    ASSERT_FALSE(events.empty());
    EXPECT_EQ(events.front().type, "system");
    EXPECT_TRUE(events.front().data.contains("hostname"));
    EXPECT_TRUE(events.front().data.contains("os"));
    EXPECT_TRUE(events.front().data.contains("arch"));
    found_system = true;
  }
  EXPECT_TRUE(found_system);
}

TEST(PlatformSmoke, ProcessCollectorIsIncremental) {
  sentinel::Config config;
  for (auto& collector : sentinel::create_platform_collectors(config)) {
    if (collector->name() != "process") continue;
    const auto first = collector->collect();
    const auto second = collector->collect();
    EXPECT_LE(second.size(), first.size())
        << "a segunda varredura só deve reportar mudanças novas";
  }
}

TEST(PlatformSmoke, HostInfoIsPresent) {
  EXPECT_FALSE(sentinel::host_hostname().empty());
  EXPECT_FALSE(sentinel::host_os_name().empty());
  EXPECT_FALSE(sentinel::host_arch().empty());
}

}  // namespace
