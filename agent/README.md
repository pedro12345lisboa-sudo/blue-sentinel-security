# Sentinel Agent

[![agent](https://github.com/pedro12345lisboa-sudo/blue-sentinel-security/actions/workflows/agent.yml/badge.svg)](https://github.com/pedro12345lisboa-sudo/blue-sentinel-security/actions/workflows/agent.yml)

Read-only defensive telemetry agent for Windows and Linux, written in C++20. It
collects **metadata only** (processes, network state, authentication events,
host inventory), normalizes it into a single JSON schema, and ships it to a
lab endpoint over HTTPS with HMAC-SHA256 authentication and anti-replay.

It never reads file contents, never writes to the system, and never opens a
socket other than the configured HTTPS endpoint.

## What it collects

| Collector | Windows | Linux | Source |
|-----------|---------|-------|--------|
| `process` | Toolhelp32 snapshot + process token/times (optional SHA-256 of the executable) | `/proc/<pid>/stat`, `comm`, `Uid`, `btime` | per-platform |
| `eventlog` | `wevtapi` query of Security (4624/4625/4634/4648) and System (7045/7034/7036) | — | Windows only |
| `auth_log` | — | tail of `/var/log/auth.log` or `/var/log/secure` (offset + rotation aware) | Linux only |
| `network` | `GetExtendedTcpTable` v4/v6 with owning PID | `/proc/net/tcp{,6}` with owner resolution through `/proc/<pid>/fd` | per-platform |
| `system` | registry, `GlobalMemoryStatusEx`, `GetSystemTimes`, fixed disks | `/proc/uptime`, `/proc/meminfo`, `/proc/stat`, `statvfs("/")`, `uname` | per-platform |

Collectors are incremental where it matters: `process` only reports PIDs it has
not seen before, `auth_log` only reads bytes appended since the last pass.

## Security properties

- **HTTPS only.** `HttpClient` refuses any URL that is not `https://` and never
  disables certificate verification — there is no flag to turn it off.
- **HMAC-SHA256 per batch.** `X-Sentinel-Timestamp`, `X-Sentinel-Signature`
  over `timestamp.body`, verified inside a ±300 s window with a constant-time
  comparison.
- **gzip** (`Content-Encoding: gzip`) with a bounded decompressor (no zip bombs
  on the receiving side of our own tests).
- **Bounded local queue.** Spooling stops at `queue_max_events` /
  `queue_max_bytes`, dropping the oldest batch first, so an unreachable
  endpoint can never fill the disk of the monitored host.
- **Retry with exponential backoff + jitter**, capped, with a retry budget
  (`max_retries`) before the batch is dropped and counted.
- **No secrets in the binary.** The HMAC key comes from `SENTINEL_SECRET` or a
  config file the operator owns; it is never logged and never written to the
  output JSON.

## Build

Dependencies: a C++20 compiler, CMake ≥ 3.20, Ninja, libcurl, OpenSSL
(crypto), zlib, nlohmann/json and GoogleTest. nlohmann/json and GoogleTest are
downloaded at configure time (`FetchContent`) when the system does not provide
them (`AGENT_FETCH_DEPS=OFF` turns that off).

### Linux (GCC/Clang)

```bash
cmake --preset linux-debug
cmake --build --preset linux-debug -j
ctest --preset linux-debug
```

Presets: `linux-debug`, `linux-release`, `linux-asan` (ASan + UBSan).

### Windows with MSYS2 (MinGW-w64)

```bash
pacman -S --needed mingw-w64-x86_64-{gcc,cmake,ninja,curl,openssl,zlib,gtest,nlohmann-json}
cmake --preset mingw64-debug
cmake --build --preset mingw64-debug -j
ctest --preset mingw64-debug
```

### Windows with MSVC + vcpkg

```powershell
$env:VCPKG_ROOT = "C:\vcpkg"
cmake --preset windows-msvc            # manifest mode reads agent/vcpkg.json
cmake --build --preset windows-msvc-release -j --config Release
ctest --preset windows-msvc-release
```

Compiler warnings are errors by default (`AGENT_WERROR=ON`, `-Wall -Wextra
-Wpedantic -Wshadow -Wformat=2 -Wcast-qual -Wdouble-promotion` on GCC/Clang,
`/W4 /permissive- /WX` on MSVC). Builds are hardened with stack protector,
`_FORTIFY_SOURCE=2`, RELRO/NOW and PIE where supported; MSVC gets `/GS`,
`/guard:cf`, ASLR and DEP.

## Usage

```bash
sentinel-agent --once                          # one collection, JSON to stdout
sentinel-agent --once --output report.json     # ... to a file
sentinel-agent --once --compact                # single-line JSON
sentinel-agent --send --endpoint https://lab.example/ingest
sentinel-agent --config /etc/sentinel/agent.json --send
sentinel-agent --help
```

Configuration precedence: built-in defaults < config file < environment
variables (`SENTINEL_ENDPOINT`, `SENTINEL_SECRET`, `SENTINEL_CA_BUNDLE`,
`SENTINEL_OUTPUT`, `SENTINEL_INTERVAL_SECONDS`, `SENTINEL_BATCH_MAX_EVENTS`,
`SENTINEL_QUEUE_MAX_EVENTS`, `SENTINEL_QUEUE_MAX_BYTES`, `SENTINEL_MAX_RETRIES`,
`SENTINEL_REQUEST_TIMEOUT_SECONDS`, `SENTINEL_HASH_BINARIES`, `SENTINEL_GZIP`,
`SENTINEL_LOG_LEVEL`) < command line. `--validate` style checks run after the
merge and reject `http://` endpoints, missing/short secrets for `--send`, zero
intervals and `--output` overwriting `--config`.

Logs go to **stderr**; stdout is reserved for the JSON document.

## Permissions

The agent works without administrator/root for everything except the Windows
Security event log:

- **Windows**: without elevation the `eventlog` collector logs one warning
  (`sem permissão para ler o canal Security`) and returns an empty batch; other
  collectors degrade per-process when `OpenProcess` is denied.
- **Linux**: `auth_log` needs read access to `/var/log/auth.log` (usually
  `adm`/`root`); everything else is world-readable `/proc`.

## Output schema

```json
{
  "schema_version": "1.0",
  "agent": { "name": "sentinel-agent", "version": "0.1.0" },
  "host": { "hostname": "web-01", "os": "Ubuntu 24.04.2 LTS", "arch": "x86_64" },
  "collected_at": "2026-10-03T16:21:49Z",
  "event_count": 411,
  "events_by_type": { "process": 400, "network_connection": 8, "system": 1 },
  "events": [
    { "type": "process", "ts": "2026-10-03T16:21:49Z", "data": { "pid": 1, "name": "systemd" } }
  ]
}
```

`event.ts` is ISO-8601 UTC; `schema_version` is versioned independently of the
agent so the backend can keep accepting older batches.

## Tests

`ctest` runs two suites:

- **unit** (67 GoogleTest cases): HMAC vectors (RFC 4231), SHA-256 vectors,
  anti-replay window (expired/future/tampered), gzip round-trip and zip-bomb
  limit, queue/batcher limits, backoff growth and cap, config precedence and
  validation, report envelope, HTTPS-only rejection, and platform smoke tests
  (unique collectors, no-throw collection, well-formed events, incremental
  `process`).
- **integration** (`agent_once_output`): `sentinel-agent --once` must print a
  document containing `"schema_version"`.

Two HTTP tests use the public network (`self-signed.badssl.com` must be
rejected, `example.com` must connect); they **skip** instead of failing when
there is no egress.

## Layout

```
agent/
├── CMakeLists.txt          # targets, warnings, hardening, tests
├── CMakePresets.json       # linux / mingw64 / windows-msvc presets
├── vcpkg.json              # curl, openssl, zlib, nlohmann-json, gtest
├── include/sentinel/       # public headers (Config, ICollector, Signer, ...)
├── src/core/               # platform-neutral logic + main.cpp
├── src/platform/windows/   # ToolHelp, wevtapi, iphlpapi collectors
├── src/platform/linux/     # procfs, auth.log, /proc/net collectors
└── tests/                  # GoogleTest suite
```

The platform is chosen at build time by CMake (`src/platform/<os>/`); no
`#ifdef` appears in the core logic. `create_platform_collectors(config)` is the
single integration point and applies `disabled_collectors`.

## Limitations (v0.1)

- No kernel-level collection yet (no eBPF/auditd/ETW subscriptions) — v0.1
  deliberately sticks to interfaces that work without elevated privileges.
- No local rule evaluation (Sigma/YARA): the agent ships facts, the lab does
  the detecting.
- Incremental collector state lives in memory; a restart re-reports the full
  process table once.
- Only IPv4/IPv6 TCP sockets are enumerated (no UDP/Unix sockets).
