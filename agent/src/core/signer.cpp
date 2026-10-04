#include "sentinel/signer.hpp"

#include "sentinel/crypto.hpp"

#include <openssl/crypto.h>

#include <charconv>
#include <utility>

namespace sentinel {
namespace {

bool constant_time_equal(const std::string& a, const std::string& b) {
  if (a.size() != b.size()) {
    return false;
  }
  return CRYPTO_memcmp(a.data(), b.data(), a.size()) == 0;
}

}  // namespace

Signer::Signer(std::string secret) : secret_(std::move(secret)) {}

Signer::Auth Signer::sign(std::string_view body) const {
  return sign(body, std::chrono::system_clock::now());
}

Signer::Auth Signer::sign(std::string_view body,
                          std::chrono::system_clock::time_point when) const {
  const auto seconds = std::chrono::duration_cast<std::chrono::seconds>(when.time_since_epoch());
  Auth auth;
  auth.timestamp = std::to_string(seconds.count());
  auth.signature = crypto::hmac_sha256_hex(secret_, auth.timestamp + "." + std::string(body));
  return auth;
}

bool Signer::verify(std::string_view secret,
                    std::string_view body,
                    std::string_view timestamp,
                    std::string_view signature,
                    std::chrono::seconds window,
                    std::chrono::system_clock::time_point now) {
  if (secret.empty() || timestamp.empty() || signature.size() != 64) {
    return false;
  }

  long long unix_seconds = 0;
  const auto* begin = timestamp.data();
  const auto* end = timestamp.data() + timestamp.size();
  const auto parsed = std::from_chars(begin, end, unix_seconds);
  if (parsed.ec != std::errc{} || parsed.ptr != end || unix_seconds < 0) {
    return false;
  }

  const auto signed_at = std::chrono::system_clock::time_point(std::chrono::seconds(unix_seconds));
  const auto skew = std::chrono::duration_cast<std::chrono::seconds>(now - signed_at);
  if (skew > window || skew < -window) {
    return false;  // fora da janela anti-replay
  }

  const std::string expected =
      crypto::hmac_sha256_hex(secret, std::string(timestamp) + "." + std::string(body));
  if (expected.empty()) {
    return false;
  }
  return constant_time_equal(expected, std::string(signature));
}

}  // namespace sentinel
