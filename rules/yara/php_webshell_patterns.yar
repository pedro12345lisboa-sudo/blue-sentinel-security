/*
   Defensive detection lab rule (BLUE-SENTINEL).
   Generic PHP web shell shape: a PHP open tag together with a dangerous
   execution or decoding function. Only the pattern strings live here - the
   lab never serves or executes them.
*/
rule PHP_Webshell_Generic
{
    meta:
        id = "bs-yara-php-webshell"
        uuid = "329268f6-d7b1-46c1-8a28-25d31fd69180"
        description = "PHP file combining an open tag with command execution or decoding"
        author = "Pedro Lisboa"
        date = "2026/10/02"
        level = "high"
        mitre = "T1505.003"
        false_positive = "Administrative scripts or installers that legitimately call these functions"
        response = "Quarantine the file, find how it was written and review the affected accounts"
    strings:
        $tag = "<?php" ascii nocase
        $danger_eval = "eval(" ascii nocase
        $danger_assert = "assert(" ascii nocase
        $danger_system = "system(" ascii nocase
        $danger_shell = "shell_exec(" ascii nocase
        $danger_b64 = "base64_decode(" ascii nocase
    condition:
        $tag and any of ($danger*)
}
