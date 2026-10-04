#pragma once

#include <cstddef>
#include <string>
#include <string_view>

namespace sentinel::gzip {

/// Comprime no formato gzip (RFC 1952). Retorna false em erro de zlib.
bool compress(std::string_view input, std::string& output, int level);

bool compress(std::string_view input, std::string& output);

/// Descomprime gzip. `max_output` limita a expansão (proteção contra bomba).
bool decompress(std::string_view input, std::string& output, std::size_t max_output);

}  // namespace sentinel::gzip
