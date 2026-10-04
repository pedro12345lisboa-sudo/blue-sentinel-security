#pragma once

// Helpers compartilhados dos coletores Linux (namespace linuxplat porque
// `linux` é macro definida por alguns compiladores).

#include "sentinel/collector.hpp"
#include "sentinel/config.hpp"

#include <cstdint>
#include <map>
#include <string>
#include <vector>

namespace sentinel::linuxplat {

/// Lê um arquivo de texto com teto de tamanho; vazio em erro/permissão.
std::string read_text_file(const std::string& path, std::size_t max_bytes);

/// readlink de um caminho simbólico; vazio em erro.
std::string read_link(const std::string& path);

/// Lista de entradas de um diretório (nomes crus, sem . e ..).
std::vector<std::string> list_directory(const std::string& path);

CollectorPtr make_process_collector(const Config& config);
CollectorPtr make_auth_log_collector(const Config& config);
CollectorPtr make_network_collector(const Config& config);
CollectorPtr make_system_collector(const Config& config);

}  // namespace sentinel::linuxplat
