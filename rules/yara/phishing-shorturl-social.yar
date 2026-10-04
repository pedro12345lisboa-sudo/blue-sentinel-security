/*
   Defensive detection lab rule (BLUE-SENTINEL).
   Phishing lure shape: a URL shortener together with a social platform
   domain in the same message or log line. Synthetic lab content only - the
   URLs below are fabricated and are never resolved.
*/
rule Phishing_Shortened_URL_Social
{
    meta:
        id = "bs-yara-phishing-shorturl"
        uuid = "aef009ad-b74f-40b3-9031-5d2cebbfcd46"
        description = "Message combining a shortened URL with a social platform link"
        author = "Pedro Lisboa"
        date = "2026/10/02"
        level = "medium"
        mitre = "T1566.002"
        false_positive = "Marketing messages and legitimate posts that shorten social links"
        response = "Do not follow the link, report the message and check whether the recipient clicked"
    strings:
        $short_bitly = "bit.ly" ascii nocase fullword
        $short_tiny = "tinyurl.com" ascii nocase fullword
        $short_isgd = "is.gd" ascii nocase fullword
        $short_ggl = "goo.gl" ascii nocase fullword
        $short_owly = "ow.ly" ascii nocase fullword
        $short_tco = "t.co" ascii nocase fullword
        $social_fb = "facebook.com" ascii nocase fullword
        $social_ig = "instagram.com" ascii nocase fullword
        $social_li = "linkedin.com" ascii nocase fullword
        $social_tt = "tiktok.com" ascii nocase fullword
        $social_wa = "whatsapp.com" ascii nocase fullword
    condition:
        any of ($short*) and any of ($social*)
}
