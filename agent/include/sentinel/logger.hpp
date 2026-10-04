#pragma once

#include <string>

namespace sentinel {

enum class LogLevel { kDebug = 0, kInfo = 1, kWarn = 2, kError = 3 };

void set_log_level(LogLevel level);
LogLevel log_level();

/// Log estruturado em stderr (o stdout é reservado ao JSON).
void log(LogLevel level, const std::string& message);

inline void log_debug(const std::string& message) { log(LogLevel::kDebug, message); }
inline void log_info(const std::string& message) { log(LogLevel::kInfo, message); }
inline void log_warn(const std::string& message) { log(LogLevel::kWarn, message); }
inline void log_error(const std::string& message) { log(LogLevel::kError, message); }

}  // namespace sentinel
