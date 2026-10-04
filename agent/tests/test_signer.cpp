#include <gtest/gtest.h>

#include "sentinel/crypto.hpp"
#include "sentinel/signer.hpp"

#include <chrono>

namespace {

using sentinel::Signer;

constexpr const char* kSecret = "chave-secreta-muito-longa-0123456789";

TEST(Signer, SignAndVerifyRoundtrip) {
  const Signer signer(kSecret);
  const auto auth = signer.sign(R"({"schema_version":"1.0"})");
  EXPECT_EQ(auth.signature.size(), 64U);
  EXPECT_FALSE(auth.timestamp.empty());

  const auto now = std::chrono::system_clock::now();
  EXPECT_TRUE(Signer::verify(kSecret, R"({"schema_version":"1.0"})", auth.timestamp, auth.signature,
                             sentinel::kAntiReplayWindow, now));
}

TEST(Signer, RejectsWrongSecret) {
  const Signer signer("segredo-um-0123456789abcdef");
  const auto auth = signer.sign("corpo");
  const auto now = std::chrono::system_clock::now();
  EXPECT_FALSE(Signer::verify("segredo-dois-0123456789abcdef", "corpo", auth.timestamp,
                              auth.signature, sentinel::kAntiReplayWindow, now));
}

TEST(Signer, RejectsTamperedBody) {
  const Signer signer(kSecret);
  const auto auth = signer.sign("corpo-original");
  const auto now = std::chrono::system_clock::now();
  EXPECT_FALSE(Signer::verify(kSecret, "corpo-trocado", auth.timestamp, auth.signature,
                              sentinel::kAntiReplayWindow, now));
}

TEST(Signer, RejectsTamperedSignature) {
  const Signer signer(kSecret);
  const auto auth = signer.sign("corpo");
  auto forged = auth.signature;
  forged[0] = forged[0] == 'a' ? 'b' : 'a';
  const auto now = std::chrono::system_clock::now();
  EXPECT_FALSE(Signer::verify(kSecret, "corpo", auth.timestamp, forged,
                              sentinel::kAntiReplayWindow, now));
}

TEST(Signer, RejectsExpiredTimestampOutsideWindow) {
  const Signer signer(kSecret);
  const auto now = std::chrono::system_clock::now();
  const auto auth = signer.sign("corpo", now - std::chrono::seconds(400));
  EXPECT_FALSE(Signer::verify(kSecret, "corpo", auth.timestamp, auth.signature,
                              sentinel::kAntiReplayWindow, now));
}

TEST(Signer, RejectsFutureTimestampBeyondSkew) {
  const Signer signer(kSecret);
  const auto now = std::chrono::system_clock::now();
  const auto auth = signer.sign("corpo", now + std::chrono::seconds(400));
  EXPECT_FALSE(Signer::verify(kSecret, "corpo", auth.timestamp, auth.signature,
                              sentinel::kAntiReplayWindow, now));
}

TEST(Signer, AcceptsTimestampInsideWindow) {
  const Signer signer(kSecret);
  const auto now = std::chrono::system_clock::now();
  const auto auth = signer.sign("corpo", now - std::chrono::seconds(60));
  EXPECT_TRUE(Signer::verify(kSecret, "corpo", auth.timestamp, auth.signature,
                             sentinel::kAntiReplayWindow, now));
}

TEST(Signer, RejectsMalformedTimestamp) {
  const Signer signer(kSecret);
  const auto auth = signer.sign("corpo");
  const auto now = std::chrono::system_clock::now();
  EXPECT_FALSE(Signer::verify(kSecret, "corpo", "nao-e-numero", auth.signature,
                              sentinel::kAntiReplayWindow, now));
  EXPECT_FALSE(Signer::verify(kSecret, "corpo", "-12345", auth.signature,
                              sentinel::kAntiReplayWindow, now));
  EXPECT_FALSE(Signer::verify(kSecret, "corpo", auth.timestamp, "curto",
                              sentinel::kAntiReplayWindow, now));
}

TEST(Signer, HmacMatchesManualComputation) {
  const Signer signer(kSecret);
  const auto auth = signer.sign("corpo");
  const auto expected =
      sentinel::crypto::hmac_sha256_hex(kSecret, auth.timestamp + "." + "corpo");
  EXPECT_EQ(auth.signature, expected);
}

}  // namespace
