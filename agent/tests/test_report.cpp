#include <gtest/gtest.h>

#include "sentinel/event.hpp"
#include "sentinel/report.hpp"

#include <sstream>

namespace {

sentinel::Event make_event(const std::string& type, const std::string& key,
                           const std::string& value) {
  sentinel::Event event;
  event.type = type;
  event.timestamp = std::chrono::system_clock::now();
  event.data[key] = value;
  return event;
}

TEST(Event, Iso8601Roundtrip) {
  const auto now = std::chrono::system_clock::now();
  const auto text = sentinel::iso8601_utc(now);
  ASSERT_EQ(text.size(), 20U);
  EXPECT_EQ(text.back(), 'Z');
  EXPECT_EQ(text[10], 'T');

  std::chrono::system_clock::time_point parsed{};
  ASSERT_TRUE(sentinel::parse_iso8601_utc(text, parsed));
  const auto seconds = [](std::chrono::system_clock::time_point tp) {
    return std::chrono::duration_cast<std::chrono::seconds>(tp.time_since_epoch()).count();
  };
  EXPECT_EQ(seconds(parsed), seconds(now));
}

TEST(Event, ParseAcceptsFractionalSeconds) {
  std::chrono::system_clock::time_point parsed{};
  ASSERT_TRUE(sentinel::parse_iso8601_utc("2026-10-03T12:00:00.500Z", parsed));
  const auto seconds = std::chrono::duration_cast<std::chrono::seconds>(parsed.time_since_epoch())
                           .count();
  EXPECT_GT(seconds, 0);
}

TEST(Event, ParseRejectsMalformed) {
  std::chrono::system_clock::time_point parsed{};
  EXPECT_FALSE(sentinel::parse_iso8601_utc("", parsed));
  EXPECT_FALSE(sentinel::parse_iso8601_utc("2026-10-03", parsed));
  EXPECT_FALSE(sentinel::parse_iso8601_utc("2026-13-99T99:99:99Z", parsed));
  EXPECT_FALSE(sentinel::parse_iso8601_utc("não é data", parsed));
}

TEST(Event, ApproximateSizeGrowsWithPayload) {
  const auto small = sentinel::approximate_size(make_event("process", "cmd", "a"));
  const auto large = sentinel::approximate_size(make_event("process", "cmd", std::string(4096, 'b')));
  EXPECT_GT(large, small);
}

TEST(Report, BuildsEnvelopeWithCounts) {
  const std::vector<sentinel::Event> events = {
      make_event("process", "pid", "123"),
      make_event("process", "pid", "456"),
      make_event("network_connection", "port", "443"),
  };

  const auto report = sentinel::build_report(events, "host-1", "Linux", "x86_64");

  EXPECT_EQ(report.at("schema_version"), "1.0");
  EXPECT_EQ(report.at("event_count"), 3);
  EXPECT_EQ(report.at("host").at("hostname"), "host-1");
  EXPECT_EQ(report.at("host").at("os"), "Linux");
  EXPECT_EQ(report.at("host").at("arch"), "x86_64");
  EXPECT_EQ(report.at("events_by_type").at("process"), 2);
  EXPECT_EQ(report.at("events_by_type").at("network_connection"), 1);
  ASSERT_EQ(report.at("events").size(), 3U);
  EXPECT_EQ(report.at("events").at(0).at("type"), "process");
  EXPECT_TRUE(report.at("events").at(0).contains("ts"));
  EXPECT_TRUE(report.at("events").at(0).contains("data"));
}

TEST(Report, EmptyBatchStillValid) {
  const auto report = sentinel::build_report({}, "host-1", "Windows", "AMD64");
  EXPECT_EQ(report.at("event_count"), 0);
  EXPECT_TRUE(report.at("events").empty());
}

TEST(Report, SerializePrettyVsCompact) {
  const std::vector<sentinel::Event> events = {make_event("system", "k", "v")};
  const auto report = sentinel::build_report(events, "h", "Linux", "x86_64");

  const auto pretty = sentinel::serialize_report(report, {.pretty = true});
  const auto compact = sentinel::serialize_report(report, {.pretty = false});
  EXPECT_NE(pretty.find('\n'), std::string::npos);
  EXPECT_EQ(compact.find('\n'), std::string::npos);
  EXPECT_LT(compact.size(), pretty.size());

  const auto reparsed = nlohmann::json::parse(compact);
  EXPECT_EQ(reparsed.at("event_count"), 1);
}

}  // namespace
