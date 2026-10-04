#pragma once

#include "sentinel/collector.hpp"

#include <vector>

namespace sentinel {

class Config;

/// Ponto único de integração por plataforma: implementada em
/// src/platform/<so>/factory.cpp, escolhida pelo CMake.
std::vector<CollectorPtr> create_platform_collectors(const Config& config);

/// Informações do host (hostname, SO, arquitetura) usadas no cabeçalho do
/// relatório; também implementadas por plataforma.
std::string host_hostname();
std::string host_os_name();
std::string host_arch();

}  // namespace sentinel
