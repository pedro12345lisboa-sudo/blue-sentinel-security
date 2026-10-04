#include <gtest/gtest.h>

#include "sentinel/backoff.hpp"

#include <random>

namespace {

TEST(Backoff, GrowsExponentiallyWithJitter) {
  std::mt19937 rng(42);
  const auto base = std::chrono::milliseconds(200);

  for (std::size_t attempt = 0; attempt < 6; ++attempt) {
    for (int sample = 0; sample < 20; ++sample) {
      const auto delay = sentinel::backoff_delay(attempt, rng, base, std::chrono::seconds(30));
      const auto exponential = base.count() * static_cast<long long>(1ULL << attempt);
      const auto lower = exponential - exponential / 2;
      EXPECT_GE(delay.count(), lower);
      EXPECT_LE(delay.count(), exponential);
    }
  }
}

TEST(Backoff, NeverExceedsCap) {
  std::mt19937 rng(7);
  const auto cap = std::chrono::seconds(2);
  for (std::size_t attempt = 20; attempt < 30; ++attempt) {
    const auto delay = sentinel::backoff_delay(attempt, rng, std::chrono::milliseconds(100), cap);
    EXPECT_LE(delay, cap);
    EXPECT_GE(delay, std::chrono::milliseconds(1000));  // já bateu o teto
  }
}

TEST(Backoff, NextAttemptStartsAtOrAbovePreviousMaximum) {
  std::mt19937 rng(11);
  const auto base = std::chrono::milliseconds(100);
  for (std::size_t attempt = 0; attempt < 8; ++attempt) {
    const auto current_max = base.count() * static_cast<long long>(1ULL << attempt);
    const auto next_min = base.count() * static_cast<long long>(1ULL << (attempt + 1)) -
                          (base.count() * static_cast<long long>(1ULL << (attempt + 1))) / 2;
    EXPECT_GE(next_min, current_max);

    const auto delay = sentinel::backoff_delay(attempt + 1, rng, base, std::chrono::seconds(30));
    EXPECT_GE(delay.count(), current_max);
  }
}

TEST(Backoff, ZeroJitterIsDeterministic) {
  std::mt19937 rng(3);
  const auto base = std::chrono::milliseconds(250);
  const auto first = sentinel::backoff_delay(2, rng, base, std::chrono::seconds(30), 0.0);
  const auto second = sentinel::backoff_delay(2, rng, base, std::chrono::seconds(30), 0.0);
  EXPECT_EQ(first, second);
  EXPECT_EQ(first.count(), base.count() * 4);
}

}  // namespace
