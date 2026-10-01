/*
   Defensive detection lab rule (BLUE-SENTINEL).
   Matches harmless SQL Injection *strings* inside synthetic web access
   log lines. The lab never sends or executes these strings.
*/
rule Web_SQLi_Access_Log
{
    meta:
        id = "bs-yara-sqli-access"
        description = "SQL injection probe present in a web access log line"
        author = "Blue Sentinel"
        date = "2024/06/01"
        level = "high"
        mitre = "T1190"
        false_positive = "Authorised vulnerability scanners or WAF test campaigns"
        response = "Block the source, review the accessed parameter and patch the query"
    strings:
        $or1 = "'1'='1" ascii nocase
        $or2 = "%271%27%3d%271" ascii nocase
        $union1 = "union%20select" ascii nocase
        $union2 = "union select" ascii nocase
        $wait1 = "waitfor%20delay" ascii nocase
        $wait2 = "waitfor delay" ascii nocase
        $schema = "information_schema" ascii nocase
        $sleep = "sleep(" ascii nocase
    condition:
        any of them
}
