cmake_minimum_required(VERSION 3.20)

project(sentinel-agent
  VERSION 0.1.0
  DESCRIPTION "Read-only defensive telemetry agent for Windows and Linux"
  LANGUAGES CXX
)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# `-std=c++20` define __STRICT_ANSI__ e esconde as declarações POSIX do
# glibc/newlib (readlink, gethostname, timegm, setenv). No POSIX o agente
# precisa delas, então pedimos o conjunto de interfaces por extensão.
if(NOT WIN32)
  add_compile_definitions(_DEFAULT_SOURCE)
endif()

if(NOT DEFINED CMAKE_BUILD_TYPE AND NOT DEFINED CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

# CMake >= 4 removed compatibility with subprojects declaring < 3.5.
if(CMAKE_VERSION VERSION_GREATER_EQUAL "4.0.0")
  set(CMAKE_POLICY_VERSION_MINIMUM 3.5)
endif()

option(AGENT_BUILD_TESTS "Build the GoogleTest suite" ON)
option(AGENT_WERROR "Treat compiler warnings as errors" ON)
option(AGENT_SANITIZE "Enable AddressSanitizer + UBSan (GCC/Clang)" OFF)
option(AGENT_FETCH_DEPS "Download nlohmann/json and GoogleTest when not found" ON)

include(FetchContent)

find_package(CURL REQUIRED)
find_package(ZLIB REQUIRED)
find_package(OpenSSL REQUIRED)

find_package(nlohmann_json 3.9 QUIET)
if(NOT nlohmann_json_FOUND)
  if(NOT AGENT_FETCH_DEPS)
    message(FATAL_ERROR "nlohmann_json not found and AGENT_FETCH_DEPS=OFF")
  endif()
  FetchContent_Declare(nlohmann_json
    URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
    URL_HASH SHA256=d6c65aca6b1ed68e7a182f4757257b107ae403032760ed6ef121c9d55e81757d
  )
  FetchContent_MakeAvailable(nlohmann_json)
endif()

set(AGENT_CORE_SOURCES
  src/core/backoff.cpp
  src/core/batcher.cpp
  src/core/config.cpp
  src/core/crypto.cpp
  src/core/delivery_queue.cpp
  src/core/event.cpp
  src/core/gzip.cpp
  src/core/http_client.cpp
  src/core/logger.cpp
  src/core/report.cpp
  src/core/scheduler.cpp
  src/core/signer.cpp
)

if(WIN32)
  set(AGENT_PLATFORM_SOURCES
    src/platform/windows/eventlog_collector.cpp
    src/platform/windows/factory.cpp
    src/platform/windows/network_collector.cpp
    src/platform/windows/platform_info.cpp
    src/platform/windows/process_collector.cpp
    src/platform/windows/system_collector.cpp
  )
else()
  set(AGENT_PLATFORM_SOURCES
    src/platform/linux/auth_log_collector.cpp
    src/platform/linux/factory.cpp
    src/platform/linux/network_collector.cpp
    src/platform/linux/platform_info.cpp
    src/platform/linux/process_collector.cpp
    src/platform/linux/system_collector.cpp
  )
endif()

add_library(agent_core STATIC ${AGENT_CORE_SOURCES} ${AGENT_PLATFORM_SOURCES})
target_include_directories(agent_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)
target_compile_features(agent_core PUBLIC cxx_std_20)

find_package(Threads REQUIRED)
target_link_libraries(agent_core
  PUBLIC
    CURL::libcurl
    ZLIB::ZLIB
    OpenSSL::Crypto
    nlohmann_json::nlohmann_json
    Threads::Threads
)

if(WIN32)
  target_link_libraries(agent_core PUBLIC wevtapi iphlpapi advapi32 shell32 ws2_32)
else()
  target_link_libraries(agent_core PUBLIC ${CMAKE_DL_LIBS})
endif()

function(agent_apply_warnings target)
  if(MSVC)
    target_compile_options(${target} PRIVATE /W4 /permissive- /utf-8)
    if(AGENT_WERROR)
      target_compile_options(${target} PRIVATE /WX)
    endif()
  else()
    target_compile_options(${target} PRIVATE
      -Wall
      -Wextra
      -Wpedantic
      -Wshadow
      -Wformat=2
      -Wcast-qual
      -Wdouble-promotion
    )
    if(AGENT_WERROR)
      target_compile_options(${target} PRIVATE -Werror)
    endif()
  endif()
endfunction()

function(agent_apply_hardening target)
  if(MSVC)
    target_compile_options(${target} PRIVATE /GS)
    target_link_options(${target} PRIVATE /DYNAMICBASE /NXCOMPAT /HIGHENTROPYVA)
    if(MSVC_VERSION GREATER_EQUAL 1920)
      target_compile_options(${target} PRIVATE /guard:cf)
      target_link_options(${target} PRIVATE /guard:cf)
    endif()
  else()
    target_compile_options(${target} PRIVATE -fstack-protector-strong -fPIE)
    if(NOT CMAKE_BUILD_TYPE STREQUAL "Debug")
      target_compile_options(${target} PRIVATE -D_FORTIFY_SOURCE=2)
    endif()
    if(UNIX)
      target_link_options(${target} PRIVATE -pie)
      target_link_options(${target} PRIVATE -Wl,-z,relro,-z,now)
    endif()
  endif()
endfunction()

agent_apply_warnings(agent_core)
agent_apply_hardening(agent_core)

if(AGENT_SANITIZE)
  if(MSVC)
    message(WARNING "AGENT_SANITIZE is only supported with GCC/Clang; ignoring on MSVC")
  else()
    foreach(tgt agent_core)
      target_compile_options(${tgt} PRIVATE -fsanitize=address,undefined -fno-omit-frame-pointer)
      target_link_options(${tgt} PRIVATE -fsanitize=address,undefined)
    endforeach()
  endif()
endif()

add_executable(agent src/core/main.cpp)
target_link_libraries(agent PRIVATE agent_core)
agent_apply_warnings(agent)
agent_apply_hardening(agent)
set_target_properties(agent PROPERTIES OUTPUT_NAME sentinel-agent)

if(AGENT_BUILD_TESTS)
  enable_testing()
  include(CTest)

  find_package(GTest QUIET)
  if(NOT GTest_FOUND)
    if(NOT AGENT_FETCH_DEPS)
      message(FATAL_ERROR "GTest not found and AGENT_FETCH_DEPS=OFF")
    endif()
    set(INSTALL_GTEST OFF CACHE BOOL "" FORCE)
    set(BUILD_GMOCK OFF CACHE BOOL "" FORCE)
    FetchContent_Declare(googletest
      URL https://github.com/google/googletest/releases/download/v1.15.2/googletest-1.15.2.tar.gz
      URL_HASH SHA256 7b42b6d6ec1a8a855b0bd35be7003917cf9d4f2fa7e063a4b5e4c7744d0964a6
    )
    FetchContent_MakeAvailable(googletest)
  endif()

  set(AGENT_TEST_SOURCES
    tests/test_backoff.cpp
    tests/test_batcher.cpp
    tests/test_config.cpp
    tests/test_crypto.cpp
    tests/test_delivery_queue.cpp
    tests/test_gzip.cpp
    tests/test_http.cpp
    tests/test_report.cpp
    tests/test_signer.cpp
    tests/test_platform_smoke.cpp
  )

  add_executable(agent_tests ${AGENT_TEST_SOURCES})
  target_link_libraries(agent_tests PRIVATE agent_core GTest::gtest GTest::gtest_main)
  agent_apply_warnings(agent_tests)
  if(AGENT_SANITIZE AND NOT MSVC)
    target_compile_options(agent_tests PRIVATE -fsanitize=address,undefined -fno-omit-frame-pointer)
    target_link_options(agent_tests PRIVATE -fsanitize=address,undefined)
  endif()

  gtest_discover_tests(agent_tests
    DISCOVERY_TIMEOUT 60
    PROPERTIES LABELS "unit"
  )

  # Critério de aceitação: --once produz JSON válido de ponta a ponta.
  add_test(NAME agent_once_output
    COMMAND agent --once
  )
  set_tests_properties(agent_once_output PROPERTIES
    PASS_REGULAR_EXPRESSION "\"schema_version\""
    LABELS "integration"
    TIMEOUT 120
  )
endif()

message(STATUS "sentinel-agent ${PROJECT_VERSION} | build=${CMAKE_BUILD_TYPE} | werror=${AGENT_WERROR} | sanitize=${AGENT_SANITIZE}")
