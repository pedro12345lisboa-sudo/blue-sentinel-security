#include <gtest/gtest.h>

#include "sentinel/crypto.hpp"

#include <cstdio>
#include <fstream>

namespace {

TEST(Crypto, Sha256KnownVectors) {
  EXPECT_EQ(sentinel::crypto::sha256_hex(""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  EXPECT_EQ(sentinel::crypto::sha256_hex("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
}

TEST(Crypto, Sha256HandlesNulBytes) {
  const std::string with_nul(std::string("abc\0def", 7), 7);
  EXPECT_NE(sentinel::crypto::sha256_hex(with_nul),
            sentinel::crypto::sha256_hex("abcdef"));
}

TEST(Crypto, HmacSha256Rfc4231Case1) {
  const std::string key(20, '\x0b');
  EXPECT_EQ(sentinel::crypto::hmac_sha256_hex(key, "Hi There"),
            "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7");
}

TEST(Crypto, HmacSha256Rfc4231Case2) {
  EXPECT_EQ(sentinel::crypto::hmac_sha256_hex("Jefe", "what do ya want for nothing?"),
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
}

TEST(Crypto, FileHashMatchesContent) {
  const std::string path = "crypto_fixture.bin";
  {
    std::ofstream output(path, std::ios::binary);
    ASSERT_TRUE(output.is_open());
    output << "abc";
  }
  std::string digest;
  ASSERT_TRUE(sentinel::crypto::sha256_file_hex(path, 1024, digest));
  EXPECT_EQ(digest,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  std::remove(path.c_str());
}

TEST(Crypto, FileHashHonorsSizeLimit) {
  const std::string path = "crypto_big_fixture.bin";
  {
    std::ofstream output(path, std::ios::binary);
    ASSERT_TRUE(output.is_open());
    output << std::string(4096, 'A');
  }
  std::string digest;
  EXPECT_FALSE(sentinel::crypto::sha256_file_hex(path, 1024, digest));
  EXPECT_TRUE(digest.empty());
  std::remove(path.c_str());
}

TEST(Crypto, FileHashRejectsMissingFile) {
  std::string digest;
  EXPECT_FALSE(sentinel::crypto::sha256_file_hex("does-not-exist.bin", 1024, digest));
}

}  // namespace
