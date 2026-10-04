#include <gtest/gtest.h>

#include "sentinel/batcher.hpp"

namespace {

sentinel::Event make_event(const std::string& type, std::size_t payload_bytes = 8) {
  sentinel::Event event;
  event.type = type;
  event.timestamp = std::chrono::system_clock::now();
  event.data["payload"] = std::string(payload_bytes, 'a');
  return event;
}

TEST(Batcher, FlushesOnEventCount) {
  sentinel::Batcher batcher(3, 1024 * 1024);
  EXPECT_FALSE(batcher.ready());

  batcher.push(make_event("process"));
  batcher.push(make_event("process"));
  EXPECT_FALSE(batcher.ready());
  batcher.push(make_event("network_connection"));
  EXPECT_TRUE(batcher.ready());

  const auto batch = batcher.take();
  EXPECT_EQ(batch.size(), 3U);
  EXPECT_TRUE(batcher.empty());
  EXPECT_EQ(batcher.bytes(), 0U);
  EXPECT_FALSE(batcher.ready());
}

TEST(Batcher, FlushesOnByteLimit) {
  sentinel::Batcher batcher(1000, 256);
  batcher.push(make_event("process", 200));
  EXPECT_TRUE(batcher.ready());

  const auto batch = batcher.take();
  EXPECT_EQ(batch.size(), 1U);
}

TEST(Batcher, KeepsEventsInOrder) {
  sentinel::Batcher batcher(2, 1024 * 1024);
  batcher.push(make_event("process"));
  batcher.push(make_event("system"));
  const auto batch = batcher.take();
  ASSERT_EQ(batch.size(), 2U);
  EXPECT_EQ(batch[0].type, "process");
  EXPECT_EQ(batch[1].type, "system");
}

TEST(Batcher, ZeroLimitsAreClamped) {
  sentinel::Batcher batcher(0, 0);
  batcher.push(make_event("process"));
  EXPECT_TRUE(batcher.ready());
}

}  // namespace
