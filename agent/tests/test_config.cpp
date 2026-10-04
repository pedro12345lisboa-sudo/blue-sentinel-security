#include <gtest/gtest.h>

#include "sentinel/config.hpp"

#include <cstdio>
#include <fstream>
#include <string>
#include <vector>

namespace {

using sentinel::Config;

void set_env(const char* name, const char* value) {
#ifdef _WIN32
  _putenv_s(name, value);
#else
  setenv(name, value, 1);
#endif
}

void clear_env(const char* name) {
#ifdef _WIN32
  _putenv_s(name, "");
#else
  unsetenv(name);
#endif
}

std::vector<char*> to_argv(std::vector<std::string>& storage) {
  std::vector<char*> argv;
  argv.reserve(storage.size());
  for (auto& item : storage) {
    argv.push_back(item.data());
  }
  return argv;
}

TEST(Config, ParsesCommandlineFlags) {
  Config config;
  std::string error;
  std::vector<std::string> args = {"agent", "--once", "--output", "saida.json", "--compact",
                                   "--disable", "network", "--interval", "15"};
  auto argv = to_argv(args);
  ASSERT_TRUE(sentinel::parse_cli(config, static_cast<int>(argv.size()), argv.data(), error))
      << error;
  EXPECT_TRUE(config.once);
  EXPECT_FALSE(config.pretty);
  EXPECT_EQ(config.output_path, "saida.json");
  EXPECT_EQ(config.interval_seconds, 15U);
  ASSERT_EQ(config.disabled_collectors.size(), 1U);
  EXPECT_EQ(config.disabled_collectors[0], "network");
}

TEST(Config, RejectsUnknownOption) {
  Config config;
  std::string error;
  std::vector<std::string> args = {"agent", "--faz-coisa"};
  auto argv = to_argv(args);
  EXPECT_FALSE(sentinel::parse_cli(config, static_cast<int>(argv.size()), argv.data(), error));
  EXPECT_FALSE(error.empty());
}

TEST(Config, RejectsMissingValue) {
  Config config;
  std::string error;
  std::vector<std::string> args = {"agent", "--output"};
  auto argv = to_argv(args);
  EXPECT_FALSE(sentinel::parse_cli(config, static_cast<int>(argv.size()), argv.data(), error));
  EXPECT_NE(error.find("valor ausente"), std::string::npos);
}

TEST(Config, LoadsJsonFile) {
  const std::string path = "agent_config_fixture.json";
  {
    std::ofstream output(path);
    output << R"({
      "endpoint": "https://lab.exemplo/api/ingest",
      "secret": "segredo-do-arquivo-0123456789",
      "interval_seconds": 45,
      "hash_binaries": true,
      "disabled_collectors": ["auth_log"]
    })";
  }

  Config config;
  std::string error;
  ASSERT_TRUE(sentinel::load_config_file(path, config, error)) << error;
  EXPECT_EQ(config.endpoint, "https://lab.exemplo/api/ingest");
  EXPECT_EQ(config.secret, "segredo-do-arquivo-0123456789");
  EXPECT_EQ(config.interval_seconds, 45U);
  EXPECT_TRUE(config.hash_binaries);
  ASSERT_EQ(config.disabled_collectors.size(), 1U);
  EXPECT_EQ(config.disabled_collectors[0], "auth_log");
  std::remove(path.c_str());
}

TEST(Config, RejectsMalformedJsonFile) {
  const std::string path = "agent_config_bad_fixture.json";
  {
    std::ofstream output(path);
    output << "{ isto nao e json ";
  }
  Config config;
  std::string error;
  EXPECT_FALSE(sentinel::load_config_file(path, config, error));
  EXPECT_NE(error.find("JSON inválido"), std::string::npos);
  std::remove(path.c_str());
}

TEST(Config, RejectsMissingFile) {
  Config config;
  std::string error;
  EXPECT_FALSE(sentinel::load_config_file("nao-existe.json", config, error));
}

TEST(Config, EnvironmentOverridesFile) {
  const std::string path = "agent_config_env_fixture.json";
  {
    std::ofstream output(path);
    output << R"({"secret": "valor-do-arquivo-0123456789", "interval_seconds": 10})";
  }
  set_env("SENTINEL_SECRET", "valor-do-env-0123456789abcdef");
  set_env("SENTINEL_INTERVAL_SECONDS", "77");

  Config config;
  std::string error;
  ASSERT_TRUE(sentinel::load_config_file(path, config, error)) << error;
  sentinel::apply_env(config);

  EXPECT_EQ(config.secret, "valor-do-env-0123456789abcdef");
  EXPECT_EQ(config.interval_seconds, 77U);

  clear_env("SENTINEL_SECRET");
  clear_env("SENTINEL_INTERVAL_SECONDS");
  std::remove(path.c_str());
}

TEST(Config, CommandLineWinsOverFileDefaults) {
  Config config;
  config.interval_seconds = 10;  // veio do arquivo

  std::string error;
  std::vector<std::string> args = {"agent", "--interval", "5"};
  auto argv = to_argv(args);
  ASSERT_TRUE(sentinel::parse_cli(config, static_cast<int>(argv.size()), argv.data(), error))
      << error;
  EXPECT_EQ(config.interval_seconds, 5U);
}

TEST(Config, ValidateRejectsInsecureEndpoint) {
  Config config;
  config.send = true;
  config.endpoint = "http://lab.exemplo/ingest";
  config.secret = "segredo-suficientemente-longo";
  std::string error;
  EXPECT_FALSE(sentinel::validate_config(config, error));
  EXPECT_NE(error.find("https"), std::string::npos);
}

TEST(Config, ValidateRequiresSecretForSend) {
  Config config;
  config.send = true;
  config.endpoint = "https://lab.exemplo/ingest";
  std::string error;
  EXPECT_FALSE(sentinel::validate_config(config, error));
  EXPECT_NE(error.find("SENTINEL_SECRET"), std::string::npos);
}

TEST(Config, ValidateRejectsShortSecret) {
  Config config;
  config.send = true;
  config.endpoint = "https://lab.exemplo/ingest";
  config.secret = "curto";
  std::string error;
  EXPECT_FALSE(sentinel::validate_config(config, error));
}

TEST(Config, ValidateAcceptsReadyConfig) {
  Config config;
  config.send = true;
  config.endpoint = "https://lab.exemplo/ingest";
  config.secret = "segredo-suficientemente-longo";
  std::string error;
  EXPECT_TRUE(sentinel::validate_config(config, error)) << error;
}

TEST(Config, ValidateRejectsZeroLimits) {
  Config config;
  config.interval_seconds = 0;
  std::string error;
  EXPECT_FALSE(sentinel::validate_config(config, error));
}

TEST(Config, UsageDocumentsModesAndEnv) {
  const auto usage = sentinel::usage_text();
  EXPECT_NE(usage.find("--once"), std::string::npos);
  EXPECT_NE(usage.find("--output"), std::string::npos);
  EXPECT_NE(usage.find("--send"), std::string::npos);
  EXPECT_NE(usage.find("SENTINEL_SECRET"), std::string::npos);
}

}  // namespace
