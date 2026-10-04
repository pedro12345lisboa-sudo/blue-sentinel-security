#pragma once

#include <cstddef>
#include <string>
#include <vector>

namespace sentinel {

/// Configuração efetiva (defaults < arquivo < variáveis de ambiente < CLI).
/// Nenhum segredo é gravado no código: `secret` só vem de arquivo ou env.
struct Config {
  // Transporte
  std::string endpoint;    // https://... (obrigatório para --send)
  std::string secret;      // chave HMAC-SHA256 (env SENTINEL_SECRET/arquivo)
  std::string ca_bundle;   // caminho opcional para CA própria

  // Modos de uso
  bool once = false;       // --once
  bool send = false;       // --send
  bool help = false;       // --help
  bool pretty = true;      // --compact: JSON em uma linha só
  std::string output_path; // --output arquivo.json
  std::string config_path; // --config arquivo.json

  // Cadência e limites
  std::size_t interval_seconds = 30;
  std::size_t batch_max_events = 200;
  std::size_t queue_max_events = 5000;
  std::size_t queue_max_bytes = 8U * 1024U * 1024U;
  std::size_t max_retries = 5;
  std::size_t request_timeout_seconds = 15;
  std::size_t eventlog_max_events = 32;
  std::size_t hash_max_bytes = 64U * 1024U * 1024U;

  // Comportamento
  bool hash_binaries = false;  // SHA-256 opcional do executável (caro)
  bool gzip = true;            // Content-Encoding: gzip no envio
  std::string log_level;       // debug|info|warn|error (vazio = info)
  std::vector<std::string> disabled_collectors;
};

/// Aplica os argumentos de linha de comando sobre `cfg`.
/// Retorna false com mensagem em `error` quando a linha é inválida.
bool parse_cli(Config& cfg, int argc, char** argv, std::string& error);

/// Carrega um arquivo JSON de configuração sobre `cfg` (merge por chave).
bool load_config_file(const std::string& path, Config& cfg, std::string& error);

/// Sobrescreve `cfg` com as variáveis SENTINEL_* quando presentes.
void apply_env(Config& cfg);

/// Valida as combinações que só podem ser conferidas depois do merge.
/// Ex.: --send exige endpoint https:// e secret preenchido.
bool validate_config(const Config& cfg, std::string& error);

std::string usage_text();

}  // namespace sentinel
