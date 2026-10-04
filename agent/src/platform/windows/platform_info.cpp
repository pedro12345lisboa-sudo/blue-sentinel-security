#include "internal.hpp"

#include "sentinel/platform.hpp"

namespace sentinel {

namespace {

std::string windows_product_name() {
  return win::registry_value(L"SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion", L"ProductName");
}

}  // namespace

std::string host_hostname() {
  DWORD size = 0;
  GetComputerNameExW(ComputerNameDnsHostname, nullptr, &size);
  if (size == 0) {
    return "unknown";
  }
  std::wstring buffer(size, L'\0');
  if (!GetComputerNameExW(ComputerNameDnsHostname, buffer.data(), &size)) {
    return "unknown";
  }
  while (!buffer.empty() && buffer.back() == L'\0') {
    buffer.pop_back();
  }
  return win::wide_to_utf8(buffer);
}

std::string host_os_name() {
  const std::string product = windows_product_name();
  return product.empty() ? std::string("Windows") : product;
}

std::string host_arch() {
  SYSTEM_INFO info{};
  GetNativeSystemInfo(&info);
  switch (info.wProcessorArchitecture) {
    case PROCESSOR_ARCHITECTURE_AMD64:
      return "x86_64";
    case PROCESSOR_ARCHITECTURE_ARM64:
      return "aarch64";
    case PROCESSOR_ARCHITECTURE_INTEL:
      return "x86";
    default:
      return "unknown";
  }
}

namespace win {

std::string registry_value(const wchar_t* subkey, const wchar_t* value_name) {
  wchar_t buffer[512];
  DWORD size = sizeof(buffer);
  DWORD type = 0;
  const LSTATUS status =
      RegGetValueW(HKEY_LOCAL_MACHINE, subkey, value_name, RRF_RT_REG_SZ, &type, buffer, &size);
  if (status != ERROR_SUCCESS || type != REG_SZ) {
    return {};
  }
  return wide_to_utf8(std::wstring(buffer));
}

}  // namespace win

}  // namespace sentinel
