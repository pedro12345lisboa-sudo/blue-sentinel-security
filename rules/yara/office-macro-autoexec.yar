/*
   Defensive detection lab rule (BLUE-SENTINEL).
   Matches auto-executing macro entry points inside harmless synthetic
   document content produced by the lab. No macro, document or payload is
   present in this repository.
*/
rule Office_Macro_AutoExec
{
    meta:
        id = "bs-yara-office-macro"
        uuid = "0845675b-da4e-4c9f-b192-8b435b23efd0"
        description = "Office document auto-execution macro entry point"
        author = "Pedro Lisboa"
        date = "2026/10/02"
        level = "medium"
        mitre = "T1059.005"
        false_positive = "Organisations that legitimately ship macro-enabled templates"
        response = "Block the attachment, check which macros ran and disable macros for untrusted documents"
    strings:
        $auto_open = "Auto_Open" ascii nocase
        $auto_open2 = "AutoOpen" ascii nocase
        $auto_close = "Auto_Close" ascii nocase
        $doc_open = "Document_Open" ascii nocase
        $wb_open = "Workbook_Open" ascii nocase
    condition:
        any of them
}
