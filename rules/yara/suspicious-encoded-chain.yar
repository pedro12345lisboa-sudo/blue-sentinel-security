/*
   Defensive detection lab rule (BLUE-SENTINEL).
   Content check over the lab's synthetic event text: a PowerShell process
   started with an encoded command and hidden/quiet flags, usually from a
   temp location. Matches fabricated lab lines only - no payload, no
   execution, no obfuscated content shipped by this repository.
*/
rule Suspicious_Encoded_Chain
{
    meta:
        id = "bs-yara-encoded-chain"
        uuid = "8bb3ea83-9375-4de6-87df-b08bdbfa1d35"
        description = "PowerShell encoded command combined with hidden flags or a temp path"
        author = "Pedro Lisboa"
        date = "2026/10/02"
        level = "high"
        mitre = "T1027"
        false_positive = "Administrative tooling that legitimately encodes commands to avoid quoting issues"
        response = "Decode the command for review, check the parent process and isolate the host if unexplained"
    strings:
        $exe = "powershell" ascii nocase
        $enc1 = "-enc " ascii nocase
        $enc2 = "-encodedcommand" ascii nocase
        $hidden1 = "-w hidden" ascii nocase
        $hidden2 = "-windowstyle hidden" ascii nocase
        $temp = "\\temp\\" ascii nocase
    condition:
        $exe and ($enc1 or $enc2) and ($hidden1 or $hidden2 or $temp)
}
