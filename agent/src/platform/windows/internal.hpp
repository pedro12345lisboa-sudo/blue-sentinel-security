#pragma once

// Helpers compartilhados dos coletores Windows. Este cabeçalho é interno:
// a plataforma inteira é escolhida em tempo de compilação pelo CMake.

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <windows.h>

#include "sentinel/collector.hpp"
#include "sentinel/config.hpp"

#include <cstdint>
#include <map>
#include <string>
#include <utility>
#include <vector>

namespace sentinel::win {

/// RAII para HANDLE (CloseHandle no escopo). Aceita nullptr e
/// INVALID_HANDLE_VALUE como "sem handle".
class ScopedHandle {
 public:
  ScopedHandle() = default;
  explicit ScopedHandle(HANDLE handle) : handle_(handle) {}
  ~ScopedHandle() { reset(); }

  ScopedHandle(const ScopedHandle&) = delete;
  ScopedHandle& operator=(const ScopedHandle&) = delete;

  ScopedHandle(ScopedHandle&& other) noexcept : handle_(other.handle_) { other.handle_ = nullptr; }
  ScopedHandle& operator=(ScopedHandle&& other) noexcept {
    if (this != &other) {
      reset();
      handle_ = other.handle_;
      other.handle_ = nullptr;
    }
    return *this;
  }

  HANDLE get() const { return handle_; }
  explicit operator bool() const {
    return handle_ != nullptr && handle_ != INVALID_HANDLE_VALUE;
  }

  void reset(HANDLE handle) {
    if (handle_ != nullptr && handle_ != INVALID_HANDLE_VALUE) {
      CloseHandle(handle_);
    }
    handle_ = handle;
  }
  void reset() { reset(nullptr); }

 private:
  HANDLE handle_ = nullptr;
};

std::string wide_to_utf8(const std::wstring& wide);
std::wstring utf8_to_wide(const std::string& utf8);

/// Mensagem legível de um código de erro do Win32.
std::string win_error_message(DWORD code);

/// Lê um valor REG_SZ de HKLM; vazio quando ausente/inválido.
std::string registry_value(const wchar_t* subkey, const wchar_t* value_name);

/// Snapshot (pid -> nome do executável) para correlacionar conexões.
std::map<std::uint32_t, std::string> snapshot_process_names();

CollectorPtr make_process_collector(const Config& config);
CollectorPtr make_eventlog_collector(const Config& config);
CollectorPtr make_network_collector(const Config& config);
CollectorPtr make_system_collector(const Config& config);

}  // namespace sentinel::win
