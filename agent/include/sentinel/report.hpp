#pragma once

#include "sentinel/event.hpp"

#include <nlohmann/json.hpp>

#include <string>
#include <vector>

namespace sentinel {

struct ReportOptions {
  bool pretty = true;
};

/// Monta o envelope do lote: metadados do agente/host, contagem por tipo e a
/// lista de eventos. É o documento assinado e enviado ao laboratório.
nlohmann::json build_report(const std::vector<Event>& events,
                            const std::string& hostname,
                            const std::string& os_name,
                            const std::string& arch);

/// Serializa o relatório (pretty ou compacto).
std::string serialize_report(const nlohmann::json& report, const ReportOptions& options);

}  // namespace sentinel
