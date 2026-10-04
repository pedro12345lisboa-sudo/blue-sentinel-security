#pragma once

#include "sentinel/event.hpp"

#include <memory>
#include <string>
#include <vector>

namespace sentinel {

/// Contrato de todos os coletores: somente leitura do sistema, sem efeitos
/// colaterais. Uma implementação por plataforma, escolhida em tempo de
/// compilação pelo CMake (sem #ifdef na lógica do agente).
class ICollector {
 public:
  virtual ~ICollector() = default;

  /// Nome estável usado no JSON de saída e em listas de habilitação.
  virtual std::string name() const = 0;

  /// Coleta os metadados disponíveis. Nunca lança: falhas parciais viram
  /// eventos de erro/warning no próprio retorno ou são logadas.
  virtual std::vector<Event> collect() = 0;
};

using CollectorPtr = std::unique_ptr<ICollector>;

}  // namespace sentinel
