#include "sentinel/delivery_queue.hpp"

namespace sentinel {

DeliveryQueue::DeliveryQueue(std::size_t max_events, std::size_t max_bytes)
    : max_events_(max_events == 0 ? 1 : max_events), max_bytes_(max_bytes == 0 ? 1 : max_bytes) {}

bool DeliveryQueue::push(std::string payload) {
  if (payload.size() > max_bytes_) {
    ++stats_.dropped;  // lote maior que a fila inteira: descarta
    return false;
  }

  while (!items_.empty() &&
         (items_.size() + 1 > max_events_ || bytes_ + payload.size() > max_bytes_)) {
    drop_oldest_locked();
  }

  bytes_ += payload.size();
  items_.push_back(std::move(payload));
  ++stats_.enqueued;
  return true;
}

const std::string& DeliveryQueue::front() const {
  static const std::string kEmpty;
  return items_.empty() ? kEmpty : items_.front();
}

void DeliveryQueue::ack() {
  if (items_.empty()) {
    return;
  }
  bytes_ -= items_.front().size();
  items_.pop_front();
  ++stats_.delivered;
}

void DeliveryQueue::nack() {
  if (items_.empty()) {
    return;
  }
  ++stats_.failures;
}

void DeliveryQueue::drop_front() { drop_oldest_locked(); }

void DeliveryQueue::drop_oldest_locked() {
  if (items_.empty()) {
    return;
  }
  bytes_ -= items_.front().size();
  items_.pop_front();
  ++stats_.dropped;
}

}  // namespace sentinel
