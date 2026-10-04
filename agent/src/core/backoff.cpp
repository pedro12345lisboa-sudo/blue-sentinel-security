#include "sentinel/backoff.hpp"

#include <algorithm>
#include <cmath>

namespace sentinel {

std::chrono::milliseconds backoff_delay(std::size_t attempt,
                                        std::mt19937& rng,
                                        std::chrono::milliseconds base,
                                        std::chrono::milliseconds cap,
                                        double jitter_fraction) {
  // Evita estouro de shift em tentativas absurdas.
  const std::size_t shift = std::min<std::size_t>(attempt, 20);
  const auto exponential = base.count() * static_cast<long long>(1ULL << shift);
  const auto capped = std::min<long long>(exponential, cap.count());

  const auto jitter_window = static_cast<long long>(
      static_cast<double>(capped) * std::clamp(jitter_fraction, 0.0, 1.0));
  std::uniform_int_distribution<long long> distribution(0, jitter_window);
  return std::chrono::milliseconds(capped - jitter_window + distribution(rng));
}

}  // namespace sentinel
