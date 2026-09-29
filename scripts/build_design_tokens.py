#!/usr/bin/env python3
"""Gera os artefatos de código a partir de assets-src/figma/design-tokens.json.

Saídas:
  1. frontend/src/styles/tokens.css          (variáveis CSS do design system)
  2. assets-src/figma/tailwind.config.snippet.ts (theme.extend do Tailwind)
  3. Tabela WCAG de contraste no stdout      (colada em docs/design/design-system.md)

Uso:
  .venv/Scripts/python.exe scripts/build_design_tokens.py [--check]

--check apenas valida (JSON, referências, roundtrip HSL) e não escreve arquivos.
"""

from __future__ import annotations

import argparse
import colorsys
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOKENS_JSON = ROOT / "assets-src" / "figma" / "design-tokens.json"
TOKENS_CSS = ROOT / "frontend" / "src" / "styles" / "tokens.css"
TAILWIND_SNIPPET = ROOT / "assets-src" / "figma" / "tailwind.config.snippet.ts"

# Aliases curtos emitidos em tokens.css (path do token -> nome da variável).
ALIASES: dict[str, str] = {
    "spacing.scale": "--space",
    "duration": "--duration",
    "easing": "--ease",
    "stagger": "--stagger",
    "borderRadius": "--radius",
    "breakpoint": "--bp",
    "typography.fontSize": "--text",
    "typography.fontFamily": "--font",
    "zIndex": "--z",
    "touch": "--touch",
    "borderWidth": "--border-w",
    "motion.distance": "--motion-distance",
}

# Pares de contraste publicados na tabela de acessibilidade.
CONTRAST_PAIRS: list[tuple[str, str, str, str]] = [
    # (rótulo fg, path fg, rótulo bg, path bg)
    ("texto primário", "color.text.primary", "fundo da página", "color.background.page"),
    ("texto primário", "color.text.primary", "superfície (card)", "color.background.surface"),
    ("texto primário", "color.text.primary", "superfície elevada", "color.background.elevated"),
    ("texto secundário", "color.text.secondary", "fundo da página", "color.background.page"),
    ("texto secundário", "color.text.secondary", "superfície (card)", "color.background.surface"),
    ("texto secundário", "color.text.secondary", "superfície elevada", "color.background.elevated"),
    ("texto terciário", "color.text.tertiary", "fundo da página", "color.background.page"),
    ("texto terciário", "color.text.tertiary", "superfície (card)", "color.background.surface"),
    ("texto terciário", "color.text.tertiary", "superfície elevada", "color.background.elevated"),
    ("link (blue.400)", "color.text.link", "fundo da página", "color.background.page"),
    ("link (blue.400)", "color.text.link", "superfície elevada", "color.background.elevated"),
    ("link hover (blue.300)", "color.text.linkHover", "superfície elevada", "color.background.elevated"),
    ("texto azul (blue.400)", "color.primary.text", "superfície elevada", "color.background.elevated"),
    ("azul de marca (blue.500)", "color.primary.default", "fundo da página", "color.background.page"),
    ("azul de marca (blue.500)", "color.primary.default", "superfície elevada", "color.background.elevated"),
    ("navy sobre botão primário", "color.primary.foreground", "botão primário", "color.primary.default"),
    ("navy sobre botão primário (hover)", "color.primary.foreground", "botão primário hover", "color.primary.hover"),
    ("navy sobre acento ciano", "color.accent.foreground", "acento ciano", "color.accent.default"),
    ("navy sobre ciano (hover)", "color.accent.foreground", "acento ciano hover", "color.accent.hover"),
    ("navy sobre destrutivo", "color.destructive.foreground", "botão destrutivo", "color.destructive.default"),
    ("navy sobre destrutivo (hover)", "color.destructive.foreground", "destrutivo hover", "color.destructive.hover"),
    ("navy sobre sucesso", "color.success.foreground", "sucesso", "color.success.default"),
    ("navy sobre aviso", "color.warning.foreground", "aviso", "color.warning.default"),
    ("severidade crítica", "color.severity.critical.base", "fundo da página", "color.background.page"),
    ("severidade alta", "color.severity.high.base", "fundo da página", "color.background.page"),
    ("severidade média", "color.severity.medium.base", "fundo da página", "color.background.page"),
    ("severidade baixa", "color.severity.low.base", "fundo da página", "color.background.page"),
    ("rótulo crítica (tint)", "color.severity.critical.text", "tint crítico 10% na superfície", None),
    ("rótulo alta (tint)", "color.severity.high.text", "tint alta 10% na superfície", None),
    ("rótulo média (tint)", "color.severity.medium.text", "tint média 10% na superfície", None),
    ("rótulo baixa (tint)", "color.severity.low.text", "tint baixa 10% na superfície", None),
    ("rótulo link em tint primário", "color.primary.text", "tint primário 10% na superfície", None),
    ("anel de foco (ciano)", "color.border.focus", "fundo da página", "color.background.page"),
    ("borda de controle (input)", "color.border.interactive", "superfície (card)", "color.background.surface"),
    ("borda de controle (input)", "color.border.interactive", "superfície elevada", "color.background.elevated"),
    ("borda decorativa", "color.border.default", "fundo da página", "color.background.page"),
    ("texto desabilitado (isenção)", "color.text.disabled", "fundo da página", "color.background.page"),
]

TOKEN_RE = re.compile(r"\{([a-zA-Z0-9_.]+)\}")
BRIDGE: dict[str, str] = {}


# --------------------------------------------------------------------------- #
# carregamento / resolução
# --------------------------------------------------------------------------- #
def load_tokens() -> dict:
    with TOKENS_JSON.open(encoding="utf-8") as fh:
        data = json.load(fh)
    data.pop("$schema", None)
    return data


def flatten(node: dict, prefix: tuple[str, ...] = ()) -> dict[str, dict]:
    out: dict[str, dict] = {}
    if isinstance(node, dict) and "value" in node and "type" in node:
        out[".".join(prefix)] = node
        return out
    if isinstance(node, dict):
        for key, value in node.items():
            if key.startswith("_") or key == "cssBridge":
                continue
            out.update(flatten(value, prefix + (key,)))
    return out


def resolve(path: str, flat: dict[str, dict], stack: tuple[str, ...] = ()) -> dict:
    if path in stack:
        raise ValueError(f"referência circular: {' -> '.join(stack + (path,))}")
    if path not in flat:
        raise KeyError(f"token não encontrado: {path}")
    token = dict(flat[path])
    value = str(token["value"])

    def repl(match: re.Match) -> str:
        target = resolve(match.group(1), flat, stack + (path,))
        return str(target["value"])

    token["value"] = TOKEN_RE.sub(repl, value)
    return token


def kebab(name: str) -> str:
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "-", name).replace("_", "-").lower()


def css_var(path: str) -> str:
    return "--bs-" + "-".join(kebab(part) for part in path.split("."))


def is_color(token: dict) -> bool:
    return token.get("type") == "color"


def hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")[:6]
    if len(h) != 6:
        raise ValueError(f"cor inválida para ponte HSL: {hex_color}")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def hsl_triplet(hex_color: str) -> str:
    r, g, b = (v / 255 for v in hex_to_rgb(hex_color))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return f"{h * 360:.1f} {s * 100:.1f}% {l * 100:.1f}%"


def triplet_to_hex(triplet: str) -> str:
    h, s, l = triplet.split()
    hh = float(h.rstrip("deg")) / 360
    ss = float(s.rstrip("%")) / 100
    ll = float(l.rstrip("%")) / 100
    r, g, b = colorsys.hls_to_rgb(hh, ll, ss)
    return "#" + "".join(f"{round(v * 255):02X}" for v in (r, g, b))


def srgb_to_lin(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(hex_color: str) -> float:
    r, g, b = (v / 255 for v in hex_to_rgb(hex_color))
    r, g, b = (srgb_to_lin(v) for v in (r, g, b))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: str, b: str) -> float:
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def grade(ratio: float) -> str:
    if ratio >= 7:
        return "AAA"
    if ratio >= 4.5:
        return "AA"
    if ratio >= 3:
        return "AA-large/UI"
    return "FAIL"


def blend(fg: str, bg: str, alpha: float) -> str:
    f = hex_to_rgb(fg)
    b = hex_to_rgb(bg)
    return "#" + "".join(f"{round(f[i] * alpha + b[i] * (1 - alpha)):02X}" for i in range(3))


# --------------------------------------------------------------------------- #
# geração
# --------------------------------------------------------------------------- #
def build_css(flat: dict[str, dict], data: dict) -> str:
    lines: list[str] = [
        "/* ==========================================================================",
        " * Blue-Sentinel — design tokens",
        " * ARQUIVO GERADO a partir de assets-src/figma/design-tokens.json",
        " * Regenerar: .venv/Scripts/python.exe scripts/build_design_tokens.py",
        " * Não editar manualmente (toda alteração começa no JSON).",
        " *",
        " * Camadas emitidas:",
        " *   1. :root  -> --bs-*       (espelho 1:1 do JSON, cores em hex)",
        " *   2. :root  -> aliases      (--space-*, --duration-*, --radius-*, ...)",
        " *   3. :root  -> bridge       (--background, --primary, ... em HSL)",
        " *      O bridge alimenta o Tailwind: hsl(var(--x)) + modificadores de",
        " *      opacidade (bg-primary/10). Tripletas HSL fazem roundtrip exato",
        " *      dos hexes originais (validado pelo próprio gerador).",
        " * ==========================================================================*/",
        "",
        ":root {",
    ]

    current_section = ""
    for path, token in flat.items():
        resolved = resolve(path, flat)
        section = ".".join(path.split(".")[:-1])
        if section != current_section:
            current_section = section
            lines.append("")
            lines.append(f"  /* --- {section} --- */")
        lines.append(f"  {css_var(path)}: {resolved['value']};")

    lines.append("}")
    lines.append("")
    lines.append(":root {")
    lines.append("  /* aliases de uso direto (gerados) */")
    for prefix, alias in ALIASES.items():
        for path in flat:
            if path.startswith(prefix + ".") and path.count(".") == prefix.count(".") + 1:
                suffix = path[len(prefix) + 1 :]
                if suffix in ("base", "recommended", "minimum", "instant"):
                    continue
                lines.append(f"  {alias}-{kebab(suffix)}: var({css_var(path)});")

    lines.append("")
    lines.append("  /* ponte legada consumida pelo Tailwind (hsl(var(--x))) */")
    for var_name, token_path in data["cssBridge"].items():
        if var_name.startswith("_"):
            continue
        token = resolve(token_path, flat)
        if not is_color(token):
            lines.append(f"  {var_name}: {token['value']};")
            continue
        value = token["value"]
        triplet = hsl_triplet(value) if len(value) == 7 else value
        if len(value) == 7 and triplet_to_hex(triplet).upper() != value.upper():
            raise ValueError(f"roundtrip HSL falhou para {token_path}: {value} -> {triplet}")
        lines.append(f"  /* {token_path} = {value} */")
        lines.append(f"  {var_name}: {triplet};")

    lines.append("}")
    lines.append("")
    return "\n".join(lines)


def font_array(value: str) -> str:
    parts = [p.strip() for p in value.split(",")]
    return "[" + ", ".join(f"'{p.strip(chr(39))}'" for p in parts) + "]"


FONT_SIZE_PAIRING: dict[str, tuple[str, str]] = {
    "display-xl": ("tight", "tighter"),
    "display-lg": ("tight", "tight"),
    "display-md": ("snug", "tight"),
    "display-sm": ("snug", "tight"),
    "heading-xl": ("snug", "tight"),
    "heading-lg": ("snug", "tight"),
    "heading-md": ("snug", "normal"),
    "heading-sm": ("snug", "normal"),
    "body-lg": ("normal", "normal"),
    "body": ("normal", "normal"),
    "body-sm": ("normal", "normal"),
    "caption": ("normal", "normal"),
    "overline": ("snug", "wide"),
}


def font_size_block(flat: dict[str, dict]) -> str:
    out = []
    for path in flat:
        if not path.startswith("typography.fontSize."):
            continue
        name = kebab(path.split(".")[-1])
        size = resolve(path, flat)["value"]
        line_key, track_key = FONT_SIZE_PAIRING.get(name, ("normal", "normal"))
        line = resolve(f"typography.lineHeight.{line_key}", flat)["value"]
        track = resolve(f"typography.letterSpacing.{track_key}", flat)["value"]
        out.append(
            f"    '{name}': ['{size}', {{ lineHeight: '{line}', letterSpacing: '{track}' }}],"
        )
    return "\n".join(out) + "\n"


def build_tailwind_snippet(flat: dict[str, dict]) -> str:
    # token -> variável bridge canônica (ignora aliases sidebar-*)
    by_token: dict[str, str] = {}
    for var, token_path in BRIDGE.items():
        if var.startswith("sidebar-"):
            continue
        by_token.setdefault(token_path, var)

    def c(path: str) -> str:
        value = resolve(path, flat)["value"]
        if not re.fullmatch(r"#[0-9A-Fa-f]{6}", value):
            # hex8 (com alfa) ou valor não-cor: usa literal
            return value
        name = by_token.get(path)
        return f"hsl(var(--{name}))" if name else value

    snippet = f"""// AUTO-GENERADO a partir de assets-src/figma/design-tokens.json
// Regenerar: .venv/Scripts/python.exe scripts/build_design_tokens.py
// Trecho equivalente a `theme.extend` de frontend/tailwind.config.js.
// Uso: cole dentro de `theme: {{ extend: {{ ... }} }}` do tailwind.config.ts.
import type {{ Config }} from 'tailwindcss';

type ThemeExtend = NonNullable<Config['theme']>['extend'];

export const themeExtend: ThemeExtend = {{
  colors: {{
    // superfícies / texto (bridge em tokens.css)
    background: '{c('color.background.page')}',
    foreground: '{c('color.text.primary')}',
    card: {{ DEFAULT: '{c('color.background.surface')}', foreground: '{c('color.text.primary')}' }},
    popover: {{ DEFAULT: '{c('color.background.elevated')}', foreground: '{c('color.text.primary')}' }},
    muted: {{ DEFAULT: '{c('color.background.surface')}', foreground: '{c('color.text.secondary')}' }},
    border: '{c('color.border.default')}',
    input: '{c('color.border.interactive')}',
    ring: '{c('color.border.focus')}',
    link: {{ DEFAULT: '{c('color.text.link')}', hover: '{c('color.text.linkHover')}' }},

    // marca / acento
    primary: {{
      DEFAULT: '{c('color.primary.default')}',
      foreground: '{c('color.primary.foreground')}',
      hover: '{c('color.primary.hover')}',
      text: '{c('color.primary.text')}',
      subtle: '{c('color.primary.subtle')}',
      glow: '{c('color.primary.glow')}',
    }},
    accent: {{
      DEFAULT: '{c('color.accent.default')}',
      foreground: '{c('color.accent.foreground')}',
      hover: '{c('color.accent.hover')}',
      subtle: '{c('color.accent.subtle')}',
      glow: '{c('color.accent.glow')}',
    }},
    secondary: {{ DEFAULT: '{c('color.background.elevated')}', foreground: '{c('color.text.primary')}', hover: '{c('color.background.hover')}' }},

    // status
    success: {{ DEFAULT: '{c('color.success.default')}', foreground: '{c('color.success.foreground')}', hover: '{c('color.success.hover')}' }},
    warning: {{ DEFAULT: '{c('color.warning.default')}', foreground: '{c('color.warning.foreground')}', hover: '{c('color.warning.hover')}' }},
    destructive: {{ DEFAULT: '{c('color.destructive.default')}', foreground: '{c('color.destructive.foreground')}', hover: '{c('color.destructive.hover')}' }},

    // severidade (laboratório)
    critical: {{ DEFAULT: '{c('color.severity.critical.base')}', text: '{c('color.severity.critical.text')}', subtle: '{c('color.severity.critical.tint')}' }},
    high: {{ DEFAULT: '{c('color.severity.high.base')}', text: '{c('color.severity.high.text')}', subtle: '{c('color.severity.high.tint')}' }},
    medium: {{ DEFAULT: '{c('color.severity.medium.base')}', text: '{c('color.severity.medium.text')}', subtle: '{c('color.severity.medium.tint')}' }},
    low: {{ DEFAULT: '{c('color.severity.low.base')}', text: '{c('color.severity.low.text')}', subtle: '{c('color.severity.low.tint')}' }},
  }},

  fontFamily: {{
    sans: {font_array(resolve('typography.fontFamily.sans', flat)['value'])},
    mono: {font_array(resolve('typography.fontFamily.mono', flat)['value'])},
    display: {font_array(resolve('typography.fontFamily.display', flat)['value'])},
  }},

  fontSize: {{
{font_size_block(flat)}  }},

  borderRadius: {{
{"".join(f"    '{kebab(path.split('.')[-1])}': '{resolve(path, flat)['value']}',\n" for path in flat if path.startswith('borderRadius.'))}  }},

  screens: {{
    xs: '{resolve('breakpoint.mobile', flat)['value']}',   // 360
    sm: '640px',
    md: '{resolve('breakpoint.tablet', flat)['value']}',   // 768
    lg: '{resolve('breakpoint.desktop', flat)['value']}',  // 1024
    xl: '1280px',
    wide: '{resolve('breakpoint.wide', flat)['value']}',   // 1440
    '2xl': '1536px',
  }},

  spacing: {{
    '18': '4.5rem',
    '22': '5.5rem',
    '30': '7.5rem',
  }},

  transitionDuration: {{
{"".join(f"    '{kebab(path.split('.')[-1])}': '{resolve(path, flat)['value']}',\n" for path in flat if path.startswith('duration.'))}  }},

  transitionTimingFunction: {{
{"".join(f"    '{kebab(path.split('.')[-1])}': '{resolve(path, flat)['value']}',\n" for path in flat if path.startswith('easing.'))}  }},

  boxShadow: {{
{"".join(f"    '{kebab(path.split('.')[-1])}': '{resolve(path, flat)['value']}',\n" for path in flat if path.startswith('shadow.'))}  }},

  zIndex: {{
{"".join(f"    '{kebab(path.split('.')[-1])}': '{resolve(path, flat)['value']}',\n" for path in flat if path.startswith('zIndex.'))}  }},
}};

const config: Config = {{
  content: [
    './src/pages/**/*.{{js,ts,jsx,tsx,mdx}}',
    './src/components/**/*.{{js,ts,jsx,tsx,mdx}}',
    './src/app/**/*.{{js,ts,jsx,tsx,mdx}}',
    './src/layouts/**/*.{{js,ts,jsx,tsx,mdx}}',
  ],
  theme: {{ extend: themeExtend }},
  plugins: [],
}};

export default config;
"""
    return snippet


def contrast_report(flat: dict[str, dict]) -> str:
    surface = resolve("color.background.surface", flat)["value"]
    rows = []
    failures = 0
    for fg_label, fg_path, bg_label, bg_path in CONTRAST_PAIRS:
        fg = resolve(fg_path, flat)["value"]
        if bg_path is None:
            tint_path = "color.primary.subtle" if fg_path == "color.primary.text" else fg_path.replace(".text", ".tint")
            bg = blend(resolve(tint_path, flat)["value"][:7], surface, 0.10)
            bg_label = f"tint 10% em {surface}"
        else:
            bg = resolve(bg_path, flat)["value"]
        ratio = contrast(fg[:7], bg[:7])
        tag = grade(ratio)
        if tag == "FAIL":
            failures += 1
        rows.append(f"| {fg_label} `{fg}` | {bg_label} `{bg}` | **{ratio:.2f}:1** | {tag} |")

    header = (
        "| Cor (foreground) | Fundo | Razão | WCAG |\n"
        "|---|---|---|---|\n" + "\n".join(rows)
    )
    suffix = f"\n\nPares avaliados: {len(rows)} | falhas: {failures}\n"
    return header + suffix


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="não escreve arquivos")
    args = parser.parse_args()

    data = load_tokens()
    flat = flatten(data)
    global BRIDGE
    BRIDGE = {k: v for k, v in data["cssBridge"].items() if not k.startswith("_")}

    print(f"tokens: {len(flat)} | referências resolvidas: ok")

    # valida roundtrip HSL de todo token de cor usado no bridge
    for var_name, token_path in BRIDGE.items():
        token = resolve(token_path, flat)
        if is_color(token) and len(token["value"]) == 7:
            back = triplet_to_hex(hsl_triplet(token["value"]))
            if back.upper() != token["value"].upper():
                raise SystemExit(f"roundtrip HSL falhou: {token_path} -> {back}")
    print(f"bridge HSL: {len(BRIDGE)} variáveis, roundtrip exato: ok")

    report = contrast_report(flat)

    if args.check:
        print(report)
        return 0

    TOKENS_CSS.write_text(build_css(flat, data), encoding="utf-8", newline="\n")
    TAILWIND_SNIPPET.write_text(build_tailwind_snippet(flat), encoding="utf-8", newline="\n")
    print(f"escreveu {TOKENS_CSS.relative_to(ROOT)}")
    print(f"escreveu {TAILWIND_SNIPPET.relative_to(ROOT)}")
    print()
    print(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
