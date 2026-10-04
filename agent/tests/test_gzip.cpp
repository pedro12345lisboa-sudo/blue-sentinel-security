#include <gtest/gtest.h>

#include "sentinel/gzip.hpp"

#include <string>

namespace {

TEST(Gzip, RoundtripText) {
  constexpr const char kRaw[] = "metadados de telemetria\0com nul\0\0fim";
  const std::string input(kRaw, sizeof(kRaw) - 1);
  std::string compressed;
  ASSERT_TRUE(sentinel::gzip::compress(input, compressed));
  EXPECT_LT(compressed.size(), input.size() + 128);

  std::string output;
  ASSERT_TRUE(sentinel::gzip::decompress(compressed, output, 1024 * 1024));
  EXPECT_EQ(output, input);
}

TEST(Gzip, RoundtripBinary) {
  std::string input;
  input.reserve(50000);
  for (int i = 0; i < 50000; ++i) {
    input.push_back(static_cast<char>(i & 0xFF));
  }
  std::string compressed;
  ASSERT_TRUE(sentinel::gzip::compress(input, compressed));

  std::string output;
  ASSERT_TRUE(sentinel::gzip::decompress(compressed, output, input.size() * 2));
  EXPECT_EQ(output, input);
}

TEST(Gzip, RejectsGarbage) {
  std::string output;
  EXPECT_FALSE(sentinel::gzip::decompress("isto nao e gzip", output, 1024));
}

TEST(Gzip, RejectsTruncatedStream) {
  const std::string input(5000, 'x');
  std::string compressed;
  ASSERT_TRUE(sentinel::gzip::compress(input, compressed));
  compressed.resize(compressed.size() / 2);

  std::string output;
  EXPECT_FALSE(sentinel::gzip::decompress(compressed, output, 1024 * 1024));
}

TEST(Gzip, RejectsExpansionBeyondLimit) {
  const std::string input(200000, 'z');
  std::string compressed;
  ASSERT_TRUE(sentinel::gzip::compress(input, compressed));

  std::string output;
  EXPECT_FALSE(sentinel::gzip::decompress(compressed, output, 1024));
}

}  // namespace
