#include "sentinel/crypto.hpp"

#include <openssl/crypto.h>
#include <openssl/evp.h>
#include <openssl/hmac.h>

#include <array>
#include <cstdio>
#include <fstream>
#include <vector>

namespace sentinel::crypto {
namespace {

constexpr std::size_t kSha256Length = 32;
constexpr std::size_t kReadChunk = 64U * 1024U;

std::string to_hex(const unsigned char* data, std::size_t length) {
  static constexpr char kDigits[] = "0123456789abcdef";
  std::string out;
  out.reserve(length * 2);
  for (std::size_t i = 0; i < length; ++i) {
    out.push_back(kDigits[(data[i] >> 4) & 0x0F]);
    out.push_back(kDigits[data[i] & 0x0F]);
  }
  return out;
}

}  // namespace

std::string sha256_hex(std::string_view data) {
  std::array<unsigned char, kSha256Length> digest{};
  unsigned int length = 0;

  EVP_MD_CTX* ctx = EVP_MD_CTX_new();
  if (ctx == nullptr) {
    return {};
  }
  const bool ok = EVP_DigestInit_ex(ctx, EVP_sha256(), nullptr) == 1 &&
                  EVP_DigestUpdate(ctx, data.data(), data.size()) == 1 &&
                  EVP_DigestFinal_ex(ctx, digest.data(), &length) == 1;
  EVP_MD_CTX_free(ctx);
  if (!ok || length != kSha256Length) {
    return {};
  }
  return to_hex(digest.data(), length);
}

std::string hmac_sha256_hex(std::string_view key, std::string_view data) {
  if (key.size() > static_cast<std::size_t>(INT_MAX)) {
    return {};
  }
  std::array<unsigned char, kSha256Length> digest{};
  unsigned int length = 0;
  const unsigned char* result =
      HMAC(EVP_sha256(), key.data(), static_cast<int>(key.size()),
           reinterpret_cast<const unsigned char*>(data.data()), data.size(), digest.data(), &length);
  if (result == nullptr || length != kSha256Length) {
    return {};
  }
  return to_hex(digest.data(), length);
}

bool sha256_file_hex(const std::string& path, std::size_t max_bytes, std::string& out_hex) {
  std::ifstream input(path, std::ios::binary);
  if (!input) {
    return false;
  }
  input.seekg(0, std::ios::end);
  const std::streamoff size = input.tellg();
  if (size < 0) {
    return false;
  }
  if (static_cast<std::size_t>(size) > max_bytes) {
    return false;  // política: não hashear artefatos grandes
  }
  input.seekg(0, std::ios::beg);

  EVP_MD_CTX* ctx = EVP_MD_CTX_new();
  if (ctx == nullptr) {
    return false;
  }
  if (EVP_DigestInit_ex(ctx, EVP_sha256(), nullptr) != 1) {
    EVP_MD_CTX_free(ctx);
    return false;
  }

  std::vector<char> buffer(kReadChunk);
  bool ok = true;
  while (input) {
    input.read(buffer.data(), static_cast<std::streamsize>(buffer.size()));
    const std::streamsize got = input.gcount();
    if (got > 0 &&
        EVP_DigestUpdate(ctx, buffer.data(), static_cast<std::size_t>(got)) != 1) {
      ok = false;
      break;
    }
  }
  if (input.bad()) {
    ok = false;
  }

  std::array<unsigned char, kSha256Length> digest{};
  unsigned int length = 0;
  if (ok && EVP_DigestFinal_ex(ctx, digest.data(), &length) != 1) {
    ok = false;
  }
  EVP_MD_CTX_free(ctx);
  if (!ok || length != kSha256Length) {
    return false;
  }
  out_hex = to_hex(digest.data(), length);
  return true;
}

}  // namespace sentinel::crypto
