#include "sentinel/event.hpp"

#include <cctype>
#include <cstdio>
#include <ctime>

namespace sentinel {
namespace {

std::tm to_utc_tm(std::time_t t) {
  std::tm tm{};
#ifdef _WIN32
  gmtime_s(&tm, &t);
#else
  gmtime_r(&t, &tm);
#endif
  return tm;
}

bool parse_int(const std::string& text, std::size_t pos, std::size_t len, int& out) {
  if (pos + len > text.size()) {
    return false;
  }
  int value = 0;
  for (std::size_t i = 0; i < len; ++i) {
    const char c = text[pos + i];
    if (!std::isdigit(static_cast<unsigned char>(c))) {
      return false;
    }
    value = value * 10 + (c - '0');
  }
  out = value;
  return true;
}

}  // namespace

std::string iso8601_utc(std::chrono::system_clock::time_point tp) {
  const auto seconds = std::chrono::time_point_cast<std::chrono::seconds>(tp);
  const std::time_t t = std::chrono::system_clock::to_time_t(seconds);
  const std::tm tm = to_utc_tm(t);
  char buffer[32];
  std::snprintf(buffer, sizeof(buffer), "%04d-%02d-%02dT%02d:%02d:%02dZ", tm.tm_year + 1900,
                tm.tm_mon + 1, tm.tm_mday, tm.tm_hour, tm.tm_min, tm.tm_sec);
  return std::string(buffer);
}

bool parse_iso8601_utc(const std::string& text, std::chrono::system_clock::time_point& out) {
  // 2026-10-03T12:34:56Z (fração opcional, sempre termina em Z)
  if (text.size() < 20 || text.back() != 'Z') {
    return false;
  }
  if (text[4] != '-' || text[7] != '-' || text[10] != 'T' || text[13] != ':' || text[16] != ':') {
    return false;
  }
  int year = 0;
  int month = 0;
  int day = 0;
  int hour = 0;
  int minute = 0;
  int second = 0;
  if (!parse_int(text, 0, 4, year) || !parse_int(text, 5, 2, month) || !parse_int(text, 8, 2, day) ||
      !parse_int(text, 11, 2, hour) || !parse_int(text, 14, 2, minute) ||
      !parse_int(text, 17, 2, second)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 60) {
    return false;
  }
  // Fração ".123" opcional entre 19 e o Z final.
  std::chrono::milliseconds fraction{0};
  if (text.size() > 20) {
    if (text[19] != '.') {
      return false;
    }
    int millis = 0;
    std::size_t digits = 0;
    for (std::size_t i = 20; i + 1 < text.size(); ++i) {
      const char c = text[i];
      if (!std::isdigit(static_cast<unsigned char>(c))) {
        return false;
      }
      if (digits < 3) {
        millis = millis * 10 + (c - '0');
        ++digits;
      }
    }
    if (digits == 0 || text.size() - 20 - digits != 1) {
      return false;
    }
    while (digits < 3) {
      millis *= 10;
      ++digits;
    }
    fraction = std::chrono::milliseconds(millis);
  }

  std::tm tm{};
  tm.tm_year = year - 1900;
  tm.tm_mon = month - 1;
  tm.tm_mday = day;
  tm.tm_hour = hour;
  tm.tm_min = minute;
  tm.tm_sec = second;
  tm.tm_isdst = 0;
#ifdef _WIN32
  const std::time_t raw = _mkgmtime(&tm);
#else
  const std::time_t raw = timegm(&tm);
#endif
  if (raw == static_cast<std::time_t>(-1)) {
    return false;
  }
  out = std::chrono::system_clock::from_time_t(raw) + fraction;
  return true;
}

nlohmann::json to_json(const Event& event) {
  nlohmann::json json;
  json["type"] = event.type;
  json["ts"] = iso8601_utc(event.timestamp);
  json["data"] = event.data;
  return json;
}

std::size_t approximate_size(const Event& event) {
  return event.type.size() + event.data.dump().size() + 64;
}

}  // namespace sentinel
