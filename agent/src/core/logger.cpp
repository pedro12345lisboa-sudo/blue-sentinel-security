#include "sentinel/logger.hpp"

#include <cstdio>
#include <ctime>
#include <mutex>

namespace sentinel {
namespace {

std::mutex g_mutex;
LogLevel g_level = LogLevel::kInfo;

const char* level_name(LogLevel level) {
  switch (level) {
    case LogLevel::kDebug:
      return "DEBUG";
    case LogLevel::kInfo:
      return "INFO";
    case LogLevel::kWarn:
      return "WARN";
    case LogLevel::kError:
      return "ERROR";
  }
  return "INFO";
}

}  // namespace

void set_log_level(LogLevel level) { g_level = level; }

LogLevel log_level() { return g_level; }

void log(LogLevel level, const std::string& message) {
  if (static_cast<int>(level) < static_cast<int>(g_level)) {
    return;
  }
  const auto now = std::time(nullptr);
  std::tm tm{};
#ifdef _WIN32
  localtime_s(&tm, &now);
#else
  localtime_r(&now, &tm);
#endif
  char stamp[32];
  std::snprintf(stamp, sizeof(stamp), "%04d-%02d-%02dT%02d:%02d:%02d", tm.tm_year + 1900,
                tm.tm_mon + 1, tm.tm_mday, tm.tm_hour, tm.tm_min, tm.tm_sec);

  std::lock_guard<std::mutex> lock(g_mutex);
  std::fprintf(stderr, "%s [%s] %s\n", stamp, level_name(level), message.c_str());
}

}  // namespace sentinel
