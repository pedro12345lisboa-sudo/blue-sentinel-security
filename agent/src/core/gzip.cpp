#include "sentinel/gzip.hpp"

#include <zlib.h>

#include <array>
#include <vector>

namespace sentinel::gzip {
namespace {

constexpr std::size_t kChunk = 16U * 1024U;

}  // namespace

bool compress(std::string_view input, std::string& output, int level) {
  output.clear();

  z_stream stream{};
  // 15 + 16 => cabeçalho gzip (RFC 1952)
  if (deflateInit2(&stream, level, Z_DEFLATED, 15 + 16, 8, Z_DEFAULT_STRATEGY) != Z_OK) {
    return false;
  }

  stream.next_in = reinterpret_cast<Bytef*>(const_cast<char*>(input.data()));
  stream.avail_in = static_cast<uInt>(input.size());

  std::array<char, kChunk> buffer{};
  int status = Z_OK;
  do {
    stream.next_out = reinterpret_cast<Bytef*>(buffer.data());
    stream.avail_out = static_cast<uInt>(buffer.size());
    status = deflate(&stream, stream.avail_in == 0 ? Z_FINISH : Z_NO_FLUSH);
    if (status != Z_OK && status != Z_STREAM_END) {
      deflateEnd(&stream);
      return false;
    }
    const std::size_t produced = buffer.size() - stream.avail_out;
    output.append(buffer.data(), produced);
  } while (status != Z_STREAM_END);

  deflateEnd(&stream);
  return true;
}

bool compress(std::string_view input, std::string& output) {
  return compress(input, output, Z_DEFAULT_COMPRESSION);
}

bool decompress(std::string_view input, std::string& output, std::size_t max_output) {
  output.clear();

  z_stream stream{};
  if (inflateInit2(&stream, 15 + 16) != Z_OK) {
    return false;
  }

  stream.next_in = reinterpret_cast<Bytef*>(const_cast<char*>(input.data()));
  stream.avail_in = static_cast<uInt>(input.size());

  std::array<char, kChunk> buffer{};
  int status = Z_OK;
  while (status != Z_STREAM_END) {
    stream.next_out = reinterpret_cast<Bytef*>(buffer.data());
    stream.avail_out = static_cast<uInt>(buffer.size());
    status = inflate(&stream, Z_NO_FLUSH);
    if (status == Z_STREAM_END) {
      break;
    }
    if (status != Z_OK) {
      inflateEnd(&stream);
      return false;
    }
    const std::size_t produced = buffer.size() - stream.avail_out;
    if (output.size() + produced > max_output) {
      inflateEnd(&stream);
      return false;  // expansão além do limite
    }
    output.append(buffer.data(), produced);
    if (stream.avail_in == 0 && stream.avail_out != 0) {
      inflateEnd(&stream);
      return false;  // entrada terminou sem fechar o stream
    }
  }
  const std::size_t produced = buffer.size() - stream.avail_out;
  if (output.size() + produced > max_output) {
    inflateEnd(&stream);
    return false;
  }
  output.append(buffer.data(), produced);
  inflateEnd(&stream);
  return true;
}

}  // namespace sentinel::gzip
