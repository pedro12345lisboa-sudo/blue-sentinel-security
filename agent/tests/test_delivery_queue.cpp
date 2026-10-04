#include <gtest/gtest.h>

#include "sentinel/delivery_queue.hpp"

namespace {

TEST(DeliveryQueue, EnqueueAndAck) {
  sentinel::DeliveryQueue queue(10, 1024);
  EXPECT_TRUE(queue.push("lote-1"));
  EXPECT_TRUE(queue.push("lote-2"));
  EXPECT_EQ(queue.size(), 2U);
  EXPECT_EQ(queue.front(), "lote-1");

  queue.ack();
  EXPECT_EQ(queue.size(), 1U);
  EXPECT_EQ(queue.front(), "lote-2");
  EXPECT_EQ(queue.stats().delivered, 1U);
  EXPECT_EQ(queue.stats().dropped, 0U);
}

TEST(DeliveryQueue, DropsOldestWhenEventLimitReached) {
  sentinel::DeliveryQueue queue(2, 1024);
  queue.push("a");
  queue.push("b");
  queue.push("c");

  EXPECT_EQ(queue.size(), 2U);
  EXPECT_EQ(queue.front(), "b");
  EXPECT_EQ(queue.stats().dropped, 1U);
}

TEST(DeliveryQueue, DropsOldestWhenByteLimitReached) {
  sentinel::DeliveryQueue queue(100, 32);
  queue.push(std::string(24, 'x'));
  queue.push(std::string(24, 'y'));

  EXPECT_EQ(queue.size(), 1U);
  EXPECT_EQ(queue.stats().dropped, 1U);
  EXPECT_LE(queue.bytes(), 32U);
}

TEST(DeliveryQueue, RejectsPayloadLargerThanQueue) {
  sentinel::DeliveryQueue queue(10, 64);
  EXPECT_FALSE(queue.push(std::string(128, 'z')));
  EXPECT_TRUE(queue.empty());
  EXPECT_EQ(queue.stats().dropped, 1U);
}

TEST(DeliveryQueue, NackKeepsBatchForRetry) {
  sentinel::DeliveryQueue queue(10, 1024);
  queue.push("lote");
  queue.nack();
  EXPECT_EQ(queue.size(), 1U);
  EXPECT_EQ(queue.stats().failures, 1U);
  EXPECT_EQ(queue.stats().delivered, 0U);
}

TEST(DeliveryQueue, DropFrontDiscardsAfterMaxRetries) {
  sentinel::DeliveryQueue queue(10, 1024);
  queue.push("lote");
  queue.drop_front();
  EXPECT_TRUE(queue.empty());
  EXPECT_EQ(queue.stats().dropped, 1U);
}

TEST(DeliveryQueue, FrontOnEmptyQueueIsSafe) {
  sentinel::DeliveryQueue queue(10, 1024);
  EXPECT_TRUE(queue.front().empty());
  queue.ack();   // não deve estourar
  queue.nack();
  queue.drop_front();
  EXPECT_EQ(queue.stats().delivered, 0U);
}

}  // namespace
