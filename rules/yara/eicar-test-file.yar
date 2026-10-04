/*
   Defensive detection lab rule (BLUE-SENTINEL).
   The EICAR anti-malware test string, stored as two halves so that no file
   in this repository contains the contiguous EICAR string (nothing here
   triggers real antivirus products). Scanned event text that carries both
   halves matches, which is how the lab proves the pipeline end to end.
   Contains no payload and no offensive technique.
*/
rule EICAR_Test_File
{
    meta:
        id = "bs-yara-eicar"
        uuid = "1f542cfa-936e-49c4-a15e-ab43d4ebf28e"
        description = "EICAR anti-malware test string (both halves present)"
        author = "Pedro Lisboa"
        date = "2026/10/02"
        level = "informational"
        mitre = ""
        false_positive = "Files created by vendors or testers to exercise their tooling"
        response = "Confirm where the test string came from and delete it from non-test locations"
    strings:
        $part1 = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$" ascii
        $part2 = "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*" ascii
    condition:
        all of them
}
