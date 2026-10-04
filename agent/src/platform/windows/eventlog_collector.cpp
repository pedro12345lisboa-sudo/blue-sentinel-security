#include "internal.hpp"

#include "sentinel/logger.hpp"

#include <winevt.h>

#include <algorithm>
#include <array>
#include <cctype>
#include <cstdlib>
#include <vector>

namespace sentinel::win {
namespace {

constexpr std::size_t kRenderChunk = 64U * 1024U;

std::string xml_tag_value(const std::string& xml, const std::string& tag) {
  const std::string open = "<" + tag;
  const std::string close = "</" + tag + ">";
  const std::size_t start = xml.find(open);
  if (start == std::string::npos) {
    return {};
  }
  const std::size_t gt = xml.find('>', start);
  if (gt == std::string::npos) {
    return {};
  }
  const std::size_t value_start = gt + 1;
  const std::size_t value_end = xml.find(close, value_start);
  if (value_end == std::string::npos) {
    return {};
  }
  return xml.substr(value_start, value_end - value_start);
}

std::string xml_data_field(const std::string& xml, const std::string& field) {
  const std::string needle = "<Data Name=\"" + field + "\">";
  const std::size_t start = xml.find(needle);
  if (start == std::string::npos) {
    return {};
  }
  const std::size_t value_start = start + needle.size();
  const std::size_t value_end = xml.find("</Data>", value_start);
  if (value_end == std::string::npos) {
    return {};
  }
  return xml.substr(value_start, value_end - value_start);
}

std::string xml_attribute(const std::string& xml, const std::string& element,
                          const std::string& attribute) {
  const std::size_t element_pos = xml.find("<" + element);
  if (element_pos == std::string::npos) {
    return {};
  }
  const std::string needle = attribute + "=\"";
  const std::size_t attr_pos = xml.find(needle, element_pos);
  if (attr_pos == std::string::npos) {
    return {};
  }
  const std::size_t value_start = attr_pos + needle.size();
  const std::size_t value_end = xml.find('"', value_start);
  if (value_end == std::string::npos) {
    return {};
  }
  return xml.substr(value_start, value_end - value_start);
}

std::string xml_decode(std::string text) {
  const std::pair<const char*, const char*> replacements[] = {
      {"&amp;", "&"}, {"&lt;", "<"}, {"&gt;", ">"}, {"&quot;", "\""}, {"&apos;", "'"}};
  for (const auto& [entity, plain] : replacements) {
    std::size_t position = 0;
    const std::string entity_string(entity);
    const std::string plain_string(plain);
    while ((position = text.find(entity_string, position)) != std::string::npos) {
      text.replace(position, entity_string.size(), plain_string);
      position += plain_string.size();
    }
  }
  return text;
}

bool render_event_xml(EVT_HANDLE event, std::string& out) {
  DWORD buffer_used = 0;
  DWORD properties = 0;
  EvtRender(nullptr, event, EvtRenderEventXml, 0, nullptr, &buffer_used, &properties);
  if (GetLastError() != ERROR_INSUFFICIENT_BUFFER || buffer_used == 0) {
    return false;
  }
  if (buffer_used > kRenderChunk * 4) {
    return false;  // evento grande demais para o nosso envelope
  }
  std::vector<BYTE> buffer(buffer_used);
  if (!EvtRender(nullptr, event, EvtRenderEventXml, buffer_used, buffer.data(), &buffer_used,
                 &properties)) {
    return false;
  }
  const wchar_t* wide = reinterpret_cast<const wchar_t*>(buffer.data());
  const std::size_t characters = buffer_used / sizeof(wchar_t);
  std::wstring xml(wide, characters > 0 ? characters - 1 : 0);  // remove o NUL final
  out = wide_to_utf8(xml);
  return true;
}

const std::array<const char*, 17>& interesting_fields() {
  static const std::array<const char*, 17> kFields = {
      "TargetUserName",    "TargetDomainName",   "SubjectUserName",
      "LogonType",         "LogonProcessName",   "AuthenticationPackageName",
      "IpAddress",         "IpPort",             "WorkstationName",
      "Status",            "SubStatus",          "ServiceName",
      "ServiceFileName",   "ServiceType",        "StartType",
      "AccountName",       "ProcessName"};
  return kFields;
}

}  // namespace

class EventLogCollector final : public ICollector {
 public:
  explicit EventLogCollector(const Config& config) : max_events_(config.eventlog_max_events) {}

  std::string name() const override { return "event_log"; }

  std::vector<Event> collect() override {
    std::vector<Event> produced;
    query_channel(L"Security",
                  L"*[System[(EventID=4624 or EventID=4625 or EventID=4634 or EventID=4648)]]",
                  produced);
    query_channel(L"System", L"*[System[(EventID=7045 or EventID=7034 or EventID=7036)]]",
                  produced);
    return produced;
  }

 private:
  void query_channel(const wchar_t* channel, const wchar_t* xpath,
                     std::vector<Event>& produced) {
    if (produced.size() >= max_events_) {
      return;
    }
    EVT_HANDLE results =
        EvtQuery(nullptr, channel, xpath, EvtQueryChannelPath | EvtQueryReverseDirection);
    if (results == nullptr) {
      const DWORD code = GetLastError();
      if (code == ERROR_ACCESS_DENIED) {
        if (!warned_access_) {
          warned_access_ = true;
          log_warn(std::string("sem permissão para ler o canal ") + wide_to_utf8(channel) +
                   " (exige admin ou grupo Event Log Readers); coletor segue vazio");
        }
      } else if (code != ERROR_EVT_CHANNEL_NOT_FOUND) {
        log_warn("EvtQuery falhou em " + wide_to_utf8(channel) + ": " + win_error_message(code));
      }
      return;
    }

    const std::size_t remaining = max_events_ - produced.size();
    std::vector<EVT_HANDLE> handles(remaining);
    DWORD fetched = 0;
    while (produced.size() < max_events_) {
      handles.assign(remaining, nullptr);
      if (!EvtNext(results, static_cast<DWORD>(handles.size()), handles.data(), 1000, 0,
                   &fetched)) {
        const DWORD code = GetLastError();
        if (code != ERROR_NO_MORE_ITEMS) {
          log_warn("EvtNext falhou em " + wide_to_utf8(channel) + ": " + win_error_message(code));
        }
        break;
      }
      for (DWORD i = 0; i < fetched && produced.size() < max_events_; ++i) {
        Event event;
        if (build_event(handles[i], wide_to_utf8(channel), event)) {
          produced.push_back(std::move(event));
        }
        EvtClose(handles[i]);
      }
    }
    EvtClose(results);
  }

  bool build_event(EVT_HANDLE handle, std::string channel, Event& event) {
    std::string xml;
    if (!render_event_xml(handle, xml)) {
      return false;
    }

    nlohmann::json data;
    data["channel"] = std::move(channel);
    const std::string event_id = xml_decode(xml_tag_value(xml, "EventID"));
    const std::string created = xml_attribute(xml, "TimeCreated", "SystemTime");
    const std::string provider = xml_attribute(xml, "Provider", "Name");
    const bool numeric_id =
        !event_id.empty() &&
        std::all_of(event_id.begin(), event_id.end(),
                    [](char c) { return std::isdigit(static_cast<unsigned char>(c)) != 0; });
    if (numeric_id) data["event_id"] = std::atoi(event_id.c_str());
    if (!created.empty()) data["time_created"] = created;
    if (!provider.empty()) data["provider"] = provider;

    nlohmann::json fields = nlohmann::json::object();
    for (const char* field : interesting_fields()) {
      const std::string value = xml_data_field(xml, field);
      if (!value.empty()) {
        fields[field] = xml_decode(value);
      }
    }
    data["fields"] = std::move(fields);

    event.type = "event_log";
    event.timestamp = std::chrono::system_clock::now();
    event.data = std::move(data);
    return true;
  }

  std::size_t max_events_;
  bool warned_access_ = false;
};

CollectorPtr make_eventlog_collector(const Config& config) {
  return std::make_unique<EventLogCollector>(config);
}

}  // namespace sentinel::win
