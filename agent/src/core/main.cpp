#include "sentinel/backoff.hpp"
#include "sentinel/batcher.hpp"
#include "sentinel/collector.hpp"
#include "sentinel/config.hpp"
#include "sentinel/delivery_queue.hpp"
#include "sentinel/event.hpp"
#include "sentinel/gzip.hpp"
#include "sentinel/http_client.hpp"
#include "sentinel/logger.hpp"
#include "sentinel/platform.hpp"
#include "sentinel/report.hpp"
#include "sentinel/scheduler.hpp"
#include "sentinel/signer.hpp"
#include "sentinel/version.hpp"

#include <algorithm>
#include <csignal>
#include <cstdio>
#include <fstream>
#include <random>
#include <thread>
#include <vector>

namespace {

sentinel::Scheduler* g_scheduler = nullptr;

void on_interrupt(int) {
  if (g_scheduler != nullptr) {
    g_scheduler->stop();
  }
}

void apply_log_level(const std::string& level) {
  using sentinel::LogLevel;
  if (level == "debug") {
    sentinel::set_log_level(LogLevel::kDebug);
  } else if (level == "info") {
    sentinel::set_log_level(LogLevel::kInfo);
  } else if (level == "warn") {
    sentinel::set_log_level(LogLevel::kWarn);
  } else if (level == "error") {
    sentinel::set_log_level(LogLevel::kError);
  }
}

std::vector<sentinel::Event> collect_all(std::vector<sentinel::CollectorPtr>& collectors,
                                         const std::string& hostname,
                                         const std::string& os_name,
                                         const std::string& arch) {
  std::vector<sentinel::Event> events;
  for (auto& collector : collectors) {
    try {
      auto produced = collector->collect();
      for (auto& event : produced) {
        events.push_back(std::move(event));
      }
      sentinel::log_debug(collector->name() + ": " + std::to_string(produced.size()) + " evento(s)");
    } catch (const std::exception& exception) {
      sentinel::log_error(std::string("coletor ") + collector->name() + " falhou: " + exception.what());
    } catch (...) {
      sentinel::log_error(std::string("coletor ") + collector->name() + " falhou com exceção desconhecida");
    }
  }

  sentinel::Event heartbeat;
  heartbeat.type = "heartbeat";
  heartbeat.timestamp = std::chrono::system_clock::now();
  heartbeat.data = {{"agent", sentinel::kAgentName},
                    {"version", sentinel::kVersion},
                    {"hostname", hostname},
                    {"os", os_name},
                    {"arch", arch},
                    {"events_in_batch", events.size()}};
  events.push_back(std::move(heartbeat));
  return events;
}

bool write_output(const std::string& path, const std::string& payload, std::string& error) {
  std::ofstream output(path, std::ios::binary | std::ios::trunc);
  if (!output) {
    error = "não foi possível abrir " + path + " para escrita";
    return false;
  }
  output << payload;
  if (!output) {
    error = "falha ao gravar " + path;
    return false;
  }
  return true;
}

/// Envia os lotes da fila com retry + backoff exponencial e jitter.
/// Retorna false quando algum lote esgotou as tentativas (lote descartado)
/// ou quando a parada foi solicitada no meio do envio.
bool drain_queue(sentinel::DeliveryQueue& queue,
                 const sentinel::HttpClient& http,
                 const sentinel::Signer& signer,
                 const sentinel::Config& config,
                 bool& dropped_batch) {
  dropped_batch = false;
  std::mt19937 rng{std::random_device{}()};
  std::size_t attempt = 0;

  while (!queue.empty()) {
    const std::string payload = queue.front();

    const auto auth = signer.sign(payload);
    std::vector<std::string> headers = {
        "Content-Type: application/json",
        "User-Agent: " + std::string(sentinel::kAgentName) + "/" + sentinel::kVersion,
        "X-Sentinel-Agent: " + std::string(sentinel::kAgentName) + "/" + sentinel::kVersion,
        "X-Sentinel-Timestamp: " + auth.timestamp,
        "X-Sentinel-Signature: " + auth.signature,
    };

    std::string body = payload;
    if (config.gzip) {
      std::string compressed;
      if (sentinel::gzip::compress(payload, compressed)) {
        body = std::move(compressed);
        headers.emplace_back("Content-Encoding: gzip");
      }
    }

    sentinel::HttpResponse response;
    std::string error;
    const bool ok = http.post(config.endpoint, body, headers, /*accept_gzip=*/false, response, error);
    const bool delivered = ok && response.status_code >= 200 && response.status_code < 300;

    if (delivered) {
      queue.ack();
      sentinel::log_debug("lote entregue (HTTP " + std::to_string(response.status_code) + ")");
      attempt = 0;
      continue;
    }

    queue.nack();
    const std::string reason =
        ok ? ("HTTP " + std::to_string(response.status_code)) : ("transporte: " + error);
    sentinel::log_warn("falha ao entregar lote: " + reason);
    ++attempt;

    if (attempt > config.max_retries) {
      sentinel::log_error("lote descartado após " + std::to_string(config.max_retries) +
                          " tentativas");
      queue.drop_front();
      attempt = 0;
      dropped_batch = true;
      continue;
    }

    const auto delay = sentinel::backoff_delay(attempt - 1, rng);
    auto remaining = delay;
    const auto slice = std::chrono::milliseconds(100);
    while (remaining.count() > 0) {
      std::this_thread::sleep_for(remaining < slice ? remaining : slice);
      remaining -= slice;
    }
  }
  return !dropped_batch;
}

int run_once(sentinel::Config& config,
             std::vector<sentinel::CollectorPtr>& collectors,
             const std::string& hostname,
             const std::string& os_name,
             const std::string& arch) {
  auto events = collect_all(collectors, hostname, os_name, arch);
  const auto report = sentinel::build_report(events, hostname, os_name, arch);
  const auto payload = sentinel::serialize_report(report, {config.pretty});

  if (!config.output_path.empty()) {
    std::string error;
    if (!write_output(config.output_path, payload + "\n", error)) {
      sentinel::log_error(error);
      return 2;
    }
    sentinel::log_info("JSON gravado em " + config.output_path + " (" +
                       std::to_string(events.size()) + " eventos)");
  } else {
    std::fputs(payload.c_str(), stdout);
    std::fputc('\n', stdout);
  }

  if (config.send) {
    sentinel::DeliveryQueue queue(config.queue_max_events, config.queue_max_bytes);
    queue.push(payload);
    sentinel::HttpClient http(config.ca_bundle);
    sentinel::Signer signer(config.secret);
    bool dropped = false;
    if (!drain_queue(queue, http, signer, config, dropped)) {
      return 2;
    }
    const auto stats = queue.stats();
    sentinel::log_info("envio concluído: entregues=" + std::to_string(stats.delivered) +
                       " descartados=" + std::to_string(stats.dropped));
  }
  return 0;
}

int run_loop(sentinel::Config& config,
             std::vector<sentinel::CollectorPtr>& collectors,
             const std::string& hostname,
             const std::string& os_name,
             const std::string& arch) {
  sentinel::Batcher batcher(config.batch_max_events, config.queue_max_bytes);
  sentinel::DeliveryQueue queue(config.queue_max_events, config.queue_max_bytes);
  sentinel::HttpClient http(config.ca_bundle);
  sentinel::Signer signer(config.secret);
  sentinel::Scheduler scheduler;
  g_scheduler = &scheduler;
  std::signal(SIGINT, on_interrupt);
#ifdef SIGTERM
  std::signal(SIGTERM, on_interrupt);
#endif

  std::size_t sequence = 0;
  const sentinel::Scheduler::Tick tick = [&]() {
    auto events = collect_all(collectors, hostname, os_name, arch);
    for (auto& event : events) {
      batcher.push(std::move(event));
    }

    while (batcher.ready()) {
      const auto batch = batcher.take();
      const auto report = sentinel::build_report(batch, hostname, os_name, arch);
      const auto payload = sentinel::serialize_report(report, {/*pretty=*/false});

      if (config.send) {
        queue.push(payload);
      } else if (!config.output_path.empty()) {
        // Sem --send: cada lote vira um arquivo numerado em --output.
        const auto path = config.output_path + "." + std::to_string(++sequence) + ".json";
        std::string error;
        if (!write_output(path, payload + "\n", error)) {
          sentinel::log_error(error);
        }
      } else {
        std::fputs(payload.c_str(), stdout);
        std::fputc('\n', stdout);
      }
    }

    if (config.send && !queue.empty()) {
      bool dropped = false;
      drain_queue(queue, http, signer, config, dropped);
      const auto stats = queue.stats();
      sentinel::log_debug("fila: " + std::to_string(queue.size()) + " lote(s), entregues=" +
                          std::to_string(stats.delivered) + ", descartados=" +
                          std::to_string(stats.dropped));
    }
  };

  sentinel::log_info(std::string(sentinel::kAgentName) + "/" + sentinel::kVersion +
                     " iniciando em modo contínuo (intervalo " +
                     std::to_string(config.interval_seconds) + "s, " +
                     std::to_string(collectors.size()) + " coletores)");
  scheduler.run(tick, std::chrono::seconds(config.interval_seconds));

  const auto stats = queue.stats();
  sentinel::log_info("encerrado; lotes entregues=" + std::to_string(stats.delivered) +
                     ", descartados=" + std::to_string(stats.dropped) +
                     ", falhas=" + std::to_string(stats.failures));
  g_scheduler = nullptr;
  return 0;
}

}  // namespace

int main(int argc, char** argv) {
  using sentinel::Config;

  Config probe;
  std::string error;
  if (!sentinel::parse_cli(probe, argc, argv, error)) {
    sentinel::log_error(error);
    std::fputs(sentinel::usage_text().c_str(), stderr);
    return 1;
  }
  if (probe.help) {
    std::fputs(sentinel::usage_text().c_str(), stdout);
    return 0;
  }

  Config config;
  if (!probe.config_path.empty() && !sentinel::load_config_file(probe.config_path, config, error)) {
    sentinel::log_error(error);
    return 1;
  }
  sentinel::apply_env(config);
  if (!sentinel::parse_cli(config, argc, argv, error)) {
    sentinel::log_error(error);
    return 1;
  }
  if (!sentinel::validate_config(config, error)) {
    sentinel::log_error(error);
    return 1;
  }
  apply_log_level(config.log_level);

  auto collectors = sentinel::create_platform_collectors(config);
  collectors.erase(std::remove_if(collectors.begin(), collectors.end(),
                                  [&](const sentinel::CollectorPtr& collector) {
                                    for (const auto& name : config.disabled_collectors) {
                                      if (collector->name() == name) {
                                        sentinel::log_info("coletor desabilitado: " + name);
                                        return true;
                                      }
                                    }
                                    return false;
                                  }),
                   collectors.end());
  if (collectors.empty()) {
    sentinel::log_error("nenhum coletor ativo");
    return 1;
  }

  const std::string hostname = sentinel::host_hostname();
  const std::string os_name = sentinel::host_os_name();
  const std::string arch = sentinel::host_arch();

  if (config.once) {
    return run_once(config, collectors, hostname, os_name, arch);
  }
  return run_loop(config, collectors, hostname, os_name, arch);
}
