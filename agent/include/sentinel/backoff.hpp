#pragma once

#include <chrono>
#include <cstddef>
#include <random>

namespace sentinel {

/// Backoff exponencial com jitter limitado.
///   delay(attempt) = min(cap, base * 2^attempt) + jitter(0..jitter_frac desse)
/// `attempt` começa em 0 (primeira falha).
std::chrono::milliseconds backoff_delay(std::size_t attempt,
                                        std::mt19937& rng,
                                        std::chrono::milliseconds base = std::chrono::milliseconds(200),
                                        std::chrono::milliseconds cap = std::chrono::seconds(30),
                                        double jitter_fraction = 0.5);

}  // namespace sentinel
