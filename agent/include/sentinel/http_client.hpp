#pragma once

#include <string>
#include <utility>
#include <vector>

namespace sentinel {

struct HttpResponse {
  long status_code = 0;
  std::string body;
};

/// Cliente HTTPS (libcurl). A verificação de certificado é obrigatória e não
/// existe flag para desligá-la — é o requisito de segurança do agente.
class HttpClient {
 public:
  explicit HttpClient(std::string ca_bundle = std::string{});

  /// POST com corpo binário seguro (pode conter NUL). `headers` no formato
  /// "Nome: valor". Retorna false em falha de transporte/TLS; `error` explica.
  bool post(const std::string& url,
            const std::string& body,
            const std::vector<std::string>& headers,
            bool accept_gzip,
            HttpResponse& response,
            std::string& error) const;

  /// Apenas https:// é aceito (o laboratório nunca recebe tráfego em claro).
  static bool is_https_url(const std::string& url);

 private:
  std::string ca_bundle_;
};

}  // namespace sentinel
