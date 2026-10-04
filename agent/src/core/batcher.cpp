#include "sentinel/batcher.hpp"

namespace sentinel {

Batcher::Batcher(std::size_t max_events, std::size_t max_bytes)
    : max_events_(max_events == 0 ? 1 : max_events), max_bytes_(max_bytes == 0 ? 1 : max_bytes) {}

void Batcher::push(Event event) {
  bytes_ += approximate_size(event);
  events_.push_back(std::move(event));
}

bool Batcher::ready() const {
  return events_.size() >= max_events_ || bytes_ >= max_bytes_;
}

std::vector<Event> Batcher::take() {
  std::vector<Event> batch;
  batch.reserve(events_.size());
  batch.assign(std::make_move_iterator(events_.begin()), std::make_move_iterator(events_.end()));
  events_.clear();
  bytes_ = 0;
  return batch;
}

}  // namespace sentinel
