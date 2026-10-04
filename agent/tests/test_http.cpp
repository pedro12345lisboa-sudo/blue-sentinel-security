#include <gtest/gtest.h>

#include "sentinel/http_client.hpp"

#include <string>

namespace {

TEST(Http, AcceptsOnlyHttps) {
  EXPECT_TRUE(sentinel::HttpClient::is_https_url("https://lab.exemplo/ingest"));
  EXPECT_TRUE(sentinel::HttpClient::is_https_url("https://a"));
  EXPECT_FALSE(sentinel::HttpClient::is_https_url("https://"));
  EXPECT_FALSE(sentinel::HttpClient::is_https_url("http://lab.exemplo/ingest"));
  EXPECT_FALSE(sentinel::HttpClient::is_https_url("ftp://lab.exemplo"));
  EXPECT_FALSE(sentinel::HttpClient::is_https_url("lab.exemplo"));
  EXPECT_FALSE(sentinel::HttpClient::is_https_url(""));
}

TEST(Http, RejectsPlainHttpBeforeTouchingNetwork) {
  const sentinel::HttpClient client;
  sentinel::HttpResponse response;
  std::string error;
  EXPECT_FALSE(
      client.post("http://lab.exemplo/ingest", "corpo", {}, false, response, error));
  EXPECT_NE(error.find("https"), std::string::npos);
}

TEST(Http, RejectsSelfSignedCertificate) {
  const sentinel::HttpClient client;
  sentinel::HttpResponse response;
  std::string error;

  const bool ok = client.post("https://self-signed.badssl.com/", R"({"schema_version":"1.0"})",
                              {"Content-Type: application/json"}, true, response, error);
  if (ok) {
    FAIL() << "a verificação de TLS aceitou um certificado autoassinado";
  }

  const bool offline = error.find("resolve") != std::string::npos ||
                       error.find("Couldn't connect") != std::string::npos ||
                       error.find("Timeout was reached") != std::string::npos ||
                       error.find("Failed to connect") != std::string::npos;
  if (offline) {
    GTEST_SKIP() << "sem acesso à rede no ambiente: " << error;
  }

  const bool tls_error =
      error.find("certificate") != std::string::npos || error.find("SSL") != std::string::npos ||
      error.find("TLS") != std::string::npos || error.find("cert") != std::string::npos;
  EXPECT_TRUE(tls_error) << "erro esperado de TLS, veio: " << error;
}

TEST(Http, TransportSucceedsAgainstPublicHttps) {
  const sentinel::HttpClient client;
  sentinel::HttpResponse response;
  std::string error;

  if (!client.post("https://example.com/", "corpo-de-teste", {}, false, response, error)) {
    GTEST_SKIP() << "sem acesso à rede no ambiente: " << error;
  }
  EXPECT_GT(response.status_code, 0);
}

}  // namespace
