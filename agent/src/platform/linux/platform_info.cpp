#include "internal.hpp"

#include "sentinel/platform.hpp"

#include <sys/utsname.h>
#include <unistd.h>

namespace sentinel {

namespace {

utsname system_name() {
  utsname result{};
  if (uname(&result) != 0) {
    return result;
  }
  return result;
}

std::string os_release_pretty_name() {
  const std::string content = linuxplat::read_text_file("/etc/os-release", 16U * 1024U);
  const std::string needle = "PRETTY_NAME=";
  const std::size_t position = content.find(needle);
  if (position == std::string::npos) {
    return {};
  }
  std::string value = content.substr(position + needle.size());
  const std::size_t newline = value.find('\n');
  if (newline != std::string::npos) {
    value.resize(newline);
  }
  if (value.size() >= 2 && value.front() == '"' && value.back() == '"') {
    value = value.substr(1, value.size() - 2);
  }
  return value;
}

}  // namespace

std::string host_hostname() {
  char buffer[256];
  if (gethostname(buffer, sizeof(buffer)) != 0) {
    return "unknown";
  }
  buffer[sizeof(buffer) - 1] = '\0';
  return std::string(buffer);
}

std::string host_os_name() {
  const std::string pretty = os_release_pretty_name();
  if (!pretty.empty()) {
    return pretty;
  }
  const utsname info = system_name();
  return info.sysname[0] != '\0' ? std::string(info.sysname) : std::string("Linux");
}

std::string host_arch() {
  const utsname info = system_name();
  return info.machine[0] != '\0' ? std::string(info.machine) : std::string("unknown");
}

}  // namespace sentinel
