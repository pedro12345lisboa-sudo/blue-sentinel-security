#pragma once

#include <cstddef>
#include <string>
#include <string_view>

namespace sentinel::crypto {

/// SHA-256 em hexa minúsculo (OpenSSL EVP).
std::string sha256_hex(std::string_view data);

/// HMAC-SHA256 em hexa minúsculo (RFC 2104).
std::string hmac_sha256_hex(std::string_view key, std::string_view data);

/// SHA-256 do conteúdo de um arquivo. Arquivos maiores que `max_bytes` são
/// recusados (retorna false) para não travar o host com I/O imprevisível.
bool sha256_file_hex(const std::string& path, std::size_t max_bytes, std::string& out_hex);

}  // namespace sentinel::crypto
