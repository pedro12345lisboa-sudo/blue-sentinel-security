#pragma once

#include <atomic>
#include <chrono>
#include <functional>

namespace sentinel {

/// Loop periódico com parada limpa (SIGINT/erro). Os ticks são discretos:
/// dorme em fatias curtas para responder rápido a `stop()`.
class Scheduler {
 public:
  using Tick = std::function<void()>;

  /// Executa `tick` a cada `interval` até `stop()` ou até `tick` pedir parar
  /// (retornando false). Retorna o número de ticks executados.
  std::size_t run(const Tick& tick, std::chrono::seconds interval);

  void stop() { stop_.store(true, std::memory_order_relaxed); }
  bool stopped() const { return stop_.load(std::memory_order_relaxed); }
  void reset() { stop_.store(false, std::memory_order_relaxed); }

 private:
  std::atomic<bool> stop_{false};
};

}  // namespace sentinel
