#pragma once

#include "sentinel/event.hpp"

#include <cstddef>
#include <deque>
#include <vector>

namespace sentinel {

/// Acumula eventos até estourar um dos limites (quantidade ou bytes) e então
/// devolve o lote pronto para serialização/envio.
class Batcher {
 public:
  Batcher(std::size_t max_events, std::size_t max_bytes);

  void push(Event event);

  /// true quando já dá para formar um lote.
  bool ready() const;

  /// Remove e devolve todos os eventos acumulados.
  std::vector<Event> take();

  std::size_t size() const { return events_.size(); }
  std::size_t bytes() const { return bytes_; }
  bool empty() const { return events_.empty(); }

 private:
  std::size_t max_events_;
  std::size_t max_bytes_;
  std::size_t bytes_ = 0;
  std::deque<Event> events_;
};

}  // namespace sentinel
