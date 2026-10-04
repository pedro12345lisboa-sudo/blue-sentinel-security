#pragma once

#include <chrono>
#include <string>
#include <string_view>

namespace sentinel {

/// Assinatura de lote: HMAC-SHA256(secret, "<timestamp>.<corpo>").
/// O timestamp é Unix em segundos; o verificador impõe janela anti-replay.
class Signer {
 public:
  struct Auth {
    std::string timestamp;  // Unix seconds em decimal
    std::string signature;  // hex
  };

  explicit Signer(std::string secret);

  Auth sign(std::string_view body) const;

  /// Assina em um instante específico (usado pela anti-replay nos testes).
  Auth sign(std::string_view body, std::chrono::system_clock::time_point when) const;

  /// Confere assinatura + janela de `window` ao redor de `now`.
  /// Comparação em tempo constante.
  static bool verify(std::string_view secret,
                     std::string_view body,
                     std::string_view timestamp,
                     std::string_view signature,
                     std::chrono::seconds window,
                     std::chrono::system_clock::time_point now);

 private:
  std::string secret_;
};

/// Janela anti-replay padrão aceita pelo laboratório.
inline constexpr std::chrono::seconds kAntiReplayWindow{300};

}  // namespace sentinel
