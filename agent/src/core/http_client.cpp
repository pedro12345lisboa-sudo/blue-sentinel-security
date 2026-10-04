#include "sentinel/http_client.hpp"

#include <curl/curl.h>

#include <mutex>

namespace sentinel {
namespace {

std::once_flag g_curl_once;

void ensure_curl_initialized() {
  std::call_once(g_curl_once, [] { curl_global_init(CURL_GLOBAL_DEFAULT); });
}

std::size_t write_callback(char* pointer, std::size_t size, std::size_t nmemb, void* userdata) {
  auto* out = static_cast<std::string*>(userdata);
  const std::size_t total = size * nmemb;
  out->append(pointer, total);
  return total;
}

}  // namespace

HttpClient::HttpClient(std::string ca_bundle) : ca_bundle_(std::move(ca_bundle)) {
  ensure_curl_initialized();
}

bool HttpClient::is_https_url(const std::string& url) {
  return url.rfind("https://", 0) == 0 && url.size() > std::string("https://").size();
}

bool HttpClient::post(const std::string& url,
                      const std::string& body,
                      const std::vector<std::string>& headers,
                      bool accept_gzip,
                      HttpResponse& response,
                      std::string& error) const {
  response = HttpResponse{};
  error.clear();

  if (!is_https_url(url)) {
    error = "URL rejeitada: somente https:// é permitido";
    return false;
  }

  CURL* curl = curl_easy_init();
  if (curl == nullptr) {
    error = "falha ao inicializar libcurl";
    return false;
  }

  std::string error_buffer(CURL_ERROR_SIZE, '\0');
  curl_slist* header_list = nullptr;
  for (const auto& header : headers) {
    header_list = curl_slist_append(header_list, header.c_str());
  }

  const auto cleanup = [&]() {
    if (header_list != nullptr) {
      curl_slist_free_all(header_list);
    }
    curl_easy_cleanup(curl);
  };

  // Verificação de certificado: obrigatória, sem flag de desativação.
  curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
  curl_easy_setopt(curl, CURLOPT_POST, 1L);
  curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE_LARGE, static_cast<curl_off_t>(body.size()));
  curl_easy_setopt(curl, CURLOPT_COPYPOSTFIELDS, body.data());
  curl_easy_setopt(curl, CURLOPT_HTTPHEADER, header_list);
  curl_easy_setopt(curl, CURLOPT_TIMEOUT, 30L);
  curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 10L);
  curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 1L);
  curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 2L);
  curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 0L);
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, &write_callback);
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response.body);
  curl_easy_setopt(curl, CURLOPT_ERRORBUFFER, error_buffer.data());
#if LIBCURL_VERSION_NUM >= 0x075500
  curl_easy_setopt(curl, CURLOPT_PROTOCOLS_STR, "https");
  curl_easy_setopt(curl, CURLOPT_REDIR_PROTOCOLS_STR, "https");
#endif
  if (accept_gzip) {
    curl_easy_setopt(curl, CURLOPT_ACCEPT_ENCODING, "");
  }
  if (!ca_bundle_.empty()) {
    curl_easy_setopt(curl, CURLOPT_CAINFO, ca_bundle_.c_str());
  }

  const CURLcode code = curl_easy_perform(curl);
  if (code != CURLE_OK) {
    const char* details = error_buffer.c_str();
    error = details[0] != '\0' ? std::string(details) : std::string(curl_easy_strerror(code));
    cleanup();
    return false;
  }

  long status = 0;
  curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &status);
  response.status_code = status;
  cleanup();
  return true;
}

}  // namespace sentinel
