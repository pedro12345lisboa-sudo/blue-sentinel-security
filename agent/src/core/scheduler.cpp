#include "sentinel/scheduler.hpp"

#include <thread>

namespace sentinel {

std::size_t Scheduler::run(const Tick& tick, std::chrono::seconds interval) {
  if (interval.count() <= 0) {
    interval = std::chrono::seconds(1);
  }
  std::size_t ticks = 0;
  while (!stopped()) {
    tick();
    ++ticks;

    // Dorme em fatias curtas para responder rápido a stop()/SIGINT.
    auto remaining = std::chrono::duration_cast<std::chrono::milliseconds>(interval);
    const auto slice = std::chrono::milliseconds(100);
    while (remaining.count() > 0 && !stopped()) {
      const auto step = remaining < slice ? remaining : slice;
      std::this_thread::sleep_for(step);
      remaining -= step;
    }
  }
  return ticks;
}

}  // namespace sentinel
