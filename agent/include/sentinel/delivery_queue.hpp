#pragma once

#include <cstddef>
#include <deque>
#include <string>

namespace sentinel {

struct QueueStats {
  std::size_t enqueued = 0;
  std::size_t delivered = 0;
  std::size_t dropped = 0;   // descarte controlado ao atingir o limite
  std::size_t failures = 0;  // envios rejeitados (entram no backoff)
};

/// Fila local em memória com teto de eventos e de bytes. Quando enche, o lote
/// mais antigo é descartado de forma controlada: a rede instável não pode
/// travar o host monitorado.
class DeliveryQueue {
 public:
  DeliveryQueue(std::size_t max_events, std::size_t max_bytes);

  /// Insere um payload já serializado. Retorna false se o lote foi descartado
  /// inteiro por exceder o teto individual (`max_bytes`).
  bool push(std::string payload);

  bool empty() const { return items_.empty(); }
  std::size_t size() const { return items_.size(); }
  std::size_t bytes() const { return bytes_; }

  /// Lote mais antigo (não remove).
  const std::string& front() const;

  /// Remove o lote da frente após envio bem-sucedido.
  void ack();

  /// Registra falha no lote da frente sem removê-lo (retry/backoff).
  void nack();

  /// Descarta o lote da frente (política após esgotar as tentativas).
  void drop_front();

  QueueStats stats() const { return stats_; }

 private:
  void drop_oldest_locked();

  std::size_t max_events_;
  std::size_t max_bytes_;
  std::size_t bytes_ = 0;
  std::deque<std::string> items_;
  QueueStats stats_;
};

}  // namespace sentinel
