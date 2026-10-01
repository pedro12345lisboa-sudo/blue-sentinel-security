/*
   Defensive detection lab rule (BLUE-SENTINEL).
   Matches harmless synthetic command lines produced by the lab scenario
   generator. Contains no exploit, payload or offensive technique.
*/
rule Suspicious_PowerShell_Commandline
{
    meta:
        id = "bs-yara-ps-encoded"
        description = "PowerShell command line with encoded or hidden arguments"
        author = "Blue Sentinel"
        date = "2024/06/01"
        level = "high"
        mitre = "T1059.001"
        false_positive = "Administrative tooling that legitimately encodes commands"
        response = "Decode the command for review, check the parent process and isolate the host if unexplained"
    strings:
        $exe = "powershell" ascii nocase
        $enc1 = "-enc " ascii nocase
        $enc2 = "-encodedcommand" ascii nocase
        $hidden1 = "-w hidden" ascii nocase
        $hidden2 = "-nop" ascii nocase
        $hidden3 = "-windowstyle hidden" ascii nocase
    condition:
        $exe and ($enc1 or $enc2) and ($hidden1 or $hidden2 or $hidden3)
}
