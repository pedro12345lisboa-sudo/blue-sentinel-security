#pragma once

#include <nlohmann/json.hpp>

#include <chrono>
#include <string>
#include <vector>

namespace sentinel {

/// Metadado coletado: um registro tipado com timestamp e payload JSON.
struct Event {
  std::string type;
  std::chrono::system_clock::time_point timestamp{};
  nlohmann::json data = nlohmann::json::object();
};

/// ISO-8601 em UTC com precisão de segundos: 2026-10-03T12:00:00Z.
std::string iso8601_utc(std::chrono::system_clock::time_point tp);

/// Converte "2026-10-03T12:00:00Z" (ou com fração) de volta para tempo.
/// Retorna false em qualquer entrada malformada.
bool parse_iso8601_utc(const std::string& text, std::chrono::system_clock::time_point& out);

nlohmann::json to_json(const Event& event);

/// Tamanho aproximado (bytes) de um evento serializado; usado pelo Batcher
/// para limitar lotes sem serializar o payload inteiro toda hora.
std::size_t approximate_size(const Event& event);

}  // namespace sentinel
