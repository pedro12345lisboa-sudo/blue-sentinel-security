#include "sentinel/config.hpp"

#include "sentinel/http_client.hpp"
#include "sentinel/logger.hpp"

#include <nlohmann/json.hpp>

#include <algorithm>
#include <cstdlib>
#include <fstream>
#include <sstream>

namespace sentinel {
namespace {

using json = nlohmann::json;

bool parse_size(const std::string& text, std::size_t& out) {
  if (text.empty()) {
    return false;
  }
  try {
    std::size_t consumed = 0;
    const unsigned long long value = std::stoull(text, &consumed);
    if (consumed != text.size()) {
      return false;
    }
    out = static_cast<std::size_t>(value);
    return true;
  } catch (...) {
    return false;
  }
}

std::string env_or_empty(const char* name) {
  const char* value = std::getenv(name);
  return value == nullptr ? std::string{} : std::string(value);
}

bool parse_bool(const std::string& text, bool& out) {
  if (text == "1" || text == "true" || text == "TRUE" || text == "yes" || text == "on") {
    out = true;
    return true;
  }
  if (text == "0" || text == "false" || text == "FALSE" || text == "no" || text == "off") {
    out = false;
    return true;
  }
  return false;
}

void merge_string(const json& object, const char* key, std::string& target) {
  const auto it = object.find(key);
  if (it != object.end() && it->is_string()) {
    target = it->get<std::string>();
  }
}

void merge_size(const json& object, const char* key, std::size_t& target) {
  const auto it = object.find(key);
  if (it == object.end()) {
    return;
  }
  if (it->is_number_unsigned()) {
    target = it->get<std::size_t>();
  } else if (it->is_number_integer()) {
    const auto value = it->get<long long>();
    if (value >= 0) {
      target = static_cast<std::size_t>(value);
    }
  }
}

void merge_bool(const json& object, const char* key, bool& target) {
  const auto it = object.find(key);
  if (it != object.end() && it->is_boolean()) {
    target = it->get<bool>();
  }
}

}  // namespace

bool parse_cli(Config& cfg, int argc, char** argv, std::string& error) {
  auto need_value = [&](int& index, const char* flag, std::string& value) -> bool {
    if (index + 1 >= argc) {
      error = std::string("valor ausente para ") + flag;
      return false;
    }
    value = argv[++index];
    return true;
  };

  for (int i = 1; i < argc; ++i) {
    const std::string arg = argv[i] == nullptr ? std::string{} : std::string(argv[i]);
    std::string value;
    if (arg == "--once") {
      cfg.once = true;
    } else if (arg == "--send") {
      cfg.send = true;
    } else if (arg == "--help" || arg == "-h") {
      cfg.help = true;
    } else if (arg == "--compact") {
      cfg.pretty = false;
    } else if (arg == "--pretty") {
      cfg.pretty = true;
    } else if (arg == "--hash-binaries") {
      cfg.hash_binaries = true;
    } else if (arg == "--no-hash-binaries") {
      cfg.hash_binaries = false;
    } else if (arg == "--no-gzip") {
      cfg.gzip = false;
    } else if (arg == "--output") {
      if (!need_value(i, "--output", cfg.output_path)) return false;
    } else if (arg == "--config") {
      if (!need_value(i, "--config", cfg.config_path)) return false;
    } else if (arg == "--endpoint") {
      if (!need_value(i, "--endpoint", cfg.endpoint)) return false;
    } else if (arg == "--ca-bundle") {
      if (!need_value(i, "--ca-bundle", cfg.ca_bundle)) return false;
    } else if (arg == "--interval") {
      if (!need_value(i, "--interval", value)) return false;
      if (!parse_size(value, cfg.interval_seconds)) {
        error = "--interval inválido: " + value;
        return false;
      }
    } else if (arg == "--max-retries") {
      if (!need_value(i, "--max-retries", value)) return false;
      if (!parse_size(value, cfg.max_retries)) {
        error = "--max-retries inválido: " + value;
        return false;
      }
    } else if (arg == "--disable") {
      if (!need_value(i, "--disable", value)) return false;
      cfg.disabled_collectors.push_back(value);
    } else if (arg == "--log-level") {
      if (!need_value(i, "--log-level", value)) return false;
      if (value != "debug" && value != "info" && value != "warn" && value != "error") {
        error = "--log-level inválido (use debug|info|warn|error)";
        return false;
      }
      cfg.log_level = value;
    } else if (!arg.empty() && arg[0] == '-') {
      error = "opção desconhecida: " + arg;
      return false;
    }
  }
  return true;
}

bool load_config_file(const std::string& path, Config& cfg, std::string& error) {
  std::ifstream input(path, std::ios::binary);
  if (!input) {
    error = "não foi possível abrir o arquivo de configuração: " + path;
    return false;
  }
  std::ostringstream buffer;
  buffer << input.rdbuf();

  const json parsed = json::parse(buffer.str(), nullptr, false);
  if (parsed.is_discarded()) {
    error = "JSON inválido no arquivo de configuração: " + path;
    return false;
  }
  if (!parsed.is_object()) {
    error = "o arquivo de configuração deve conter um objeto JSON: " + path;
    return false;
  }

  merge_string(parsed, "endpoint", cfg.endpoint);
  merge_string(parsed, "secret", cfg.secret);
  merge_string(parsed, "ca_bundle", cfg.ca_bundle);
  merge_string(parsed, "output_path", cfg.output_path);
  merge_size(parsed, "interval_seconds", cfg.interval_seconds);
  merge_size(parsed, "batch_max_events", cfg.batch_max_events);
  merge_size(parsed, "queue_max_events", cfg.queue_max_events);
  merge_size(parsed, "queue_max_bytes", cfg.queue_max_bytes);
  merge_size(parsed, "max_retries", cfg.max_retries);
  merge_size(parsed, "request_timeout_seconds", cfg.request_timeout_seconds);
  merge_size(parsed, "eventlog_max_events", cfg.eventlog_max_events);
  merge_size(parsed, "hash_max_bytes", cfg.hash_max_bytes);
  merge_bool(parsed, "hash_binaries", cfg.hash_binaries);
  merge_bool(parsed, "gzip", cfg.gzip);
  merge_bool(parsed, "pretty", cfg.pretty);

  const auto disabled = parsed.find("disabled_collectors");
  if (disabled != parsed.end() && disabled->is_array()) {
    for (const auto& item : *disabled) {
      if (item.is_string()) {
        cfg.disabled_collectors.push_back(item.get<std::string>());
      }
    }
  }

  static constexpr const char* kKnownKeys[] = {
      "endpoint",      "secret",                 "ca_bundle",
      "output_path",   "interval_seconds",       "batch_max_events",
      "queue_max_events", "queue_max_bytes",     "max_retries",
      "request_timeout_seconds", "eventlog_max_events", "hash_max_bytes",
      "hash_binaries", "gzip",                   "pretty",
      "log_level",     "disabled_collectors"};

  for (auto it = parsed.begin(); it != parsed.end(); ++it) {
    const bool known = std::any_of(std::begin(kKnownKeys), std::end(kKnownKeys),
                                   [&](const char* key) { return it.key() == key; });
    if (!known) {
      log_warn("chave desconhecida ignorada na configuração: " + it.key());
    }
    if (it.key() == "log_level" && it->is_string()) {
      cfg.log_level = it->get<std::string>();
    }
  }
  return true;
}

void apply_env(Config& cfg) {
  const auto endpoint = env_or_empty("SENTINEL_ENDPOINT");
  if (!endpoint.empty()) cfg.endpoint = endpoint;

  const auto secret = env_or_empty("SENTINEL_SECRET");
  if (!secret.empty()) cfg.secret = secret;

  const auto ca_bundle = env_or_empty("SENTINEL_CA_BUNDLE");
  if (!ca_bundle.empty()) cfg.ca_bundle = ca_bundle;

  const auto output = env_or_empty("SENTINEL_OUTPUT");
  if (!output.empty()) cfg.output_path = output;

  const auto interval = env_or_empty("SENTINEL_INTERVAL_SECONDS");
  if (!interval.empty()) parse_size(interval, cfg.interval_seconds);

  const auto batch = env_or_empty("SENTINEL_BATCH_MAX_EVENTS");
  if (!batch.empty()) parse_size(batch, cfg.batch_max_events);

  const auto queue_events = env_or_empty("SENTINEL_QUEUE_MAX_EVENTS");
  if (!queue_events.empty()) parse_size(queue_events, cfg.queue_max_events);

  const auto queue_bytes = env_or_empty("SENTINEL_QUEUE_MAX_BYTES");
  if (!queue_bytes.empty()) parse_size(queue_bytes, cfg.queue_max_bytes);

  const auto retries = env_or_empty("SENTINEL_MAX_RETRIES");
  if (!retries.empty()) parse_size(retries, cfg.max_retries);

  const auto timeout = env_or_empty("SENTINEL_REQUEST_TIMEOUT_SECONDS");
  if (!timeout.empty()) parse_size(timeout, cfg.request_timeout_seconds);

  const auto hash = env_or_empty("SENTINEL_HASH_BINARIES");
  if (!hash.empty()) parse_bool(hash, cfg.hash_binaries);

  const auto gzip_env = env_or_empty("SENTINEL_GZIP");
  if (!gzip_env.empty()) parse_bool(gzip_env, cfg.gzip);

  const auto level = env_or_empty("SENTINEL_LOG_LEVEL");
  if (!level.empty() &&
      (level == "debug" || level == "info" || level == "warn" || level == "error")) {
    cfg.log_level = level;
  }
}

bool validate_config(const Config& cfg, std::string& error) {
  if (!cfg.endpoint.empty() && !HttpClient::is_https_url(cfg.endpoint)) {
    error = "endpoint deve usar https:// (verificação de certificado obrigatória)";
    return false;
  }
  if (cfg.send) {
    if (cfg.endpoint.empty()) {
      error = "--send exige um endpoint (SENTINEL_ENDPOINT ou --endpoint)";
      return false;
    }
    if (cfg.secret.empty()) {
      error = "--send exige a chave HMAC (SENTINEL_SECRET ou campo \"secret\" no arquivo)";
      return false;
    }
    if (cfg.secret.size() < 16) {
      error = "a chave HMAC deve ter pelo menos 16 caracteres";
      return false;
    }
  }
  if (cfg.interval_seconds == 0) {
    error = "interval_seconds deve ser maior que zero";
    return false;
  }
  if (cfg.batch_max_events == 0) {
    error = "batch_max_events deve ser maior que zero";
    return false;
  }
  if (cfg.queue_max_bytes < 1024) {
    error = "queue_max_bytes mínimo é 1024";
    return false;
  }
  if (cfg.queue_max_events == 0) {
    error = "queue_max_events deve ser maior que zero";
    return false;
  }
  if (!cfg.output_path.empty() && cfg.output_path == cfg.config_path) {
    error = "--output não pode sobrescrever o arquivo de configuração";
    return false;
  }
  return true;
}

std::string usage_text() {
  return R"(sentinel-agent — coletor defensivo somente leitura (metadados)

Uso:
  sentinel-agent --once [--output arquivo.json] [--compact]
  sentinel-agent --send [--interval segundos]
  sentinel-agent --config arquivo.json [--once|--send]

Opções:
  --once                Coleta uma vez e imprime JSON no stdout
  --output <arquivo>    Grava o JSON em arquivo em vez do stdout
  --send                Envia o lote ao endpoint do laboratório (HTTPS)
  --endpoint <url>      Endpoint https:// do laboratório
  --config <arquivo>    Arquivo JSON de configuração
  --interval <segundos> Cadência do laço contínuo (padrão 30)
  --max-retries <n>     Tentativas de envio por lote (padrão 5)
  --disable <nome>      Desliga um coletor (repetível)
  --hash-binaries       Inclui SHA-256 do executável (opcional/caro)
  --no-hash-binaries    Desliga o hash (padrão)
  --no-gzip             Envia sem Content-Encoding: gzip
  --compact             JSON em uma linha só
  --pretty              JSON indentado (padrão)
  --log-level <nivel>   debug|info|warn|error (ou SENTINEL_LOG_LEVEL)
  -h, --help            Esta mensagem

Variáveis de ambiente:
  SENTINEL_ENDPOINT, SENTINEL_SECRET, SENTINEL_CA_BUNDLE, SENTINEL_OUTPUT,
  SENTINEL_INTERVAL_SECONDS, SENTINEL_BATCH_MAX_EVENTS, SENTINEL_QUEUE_MAX_EVENTS,
  SENTINEL_QUEUE_MAX_BYTES, SENTINEL_MAX_RETRIES, SENTINEL_REQUEST_TIMEOUT_SECONDS,
  SENTINEL_HASH_BINARIES, SENTINEL_GZIP, SENTINEL_LOG_LEVEL

Segredos nunca vão no código nem na linha de comando: use arquivo restrito
(chmod 600) ou variável de ambiente.)";
}

}  // namespace sentinel
