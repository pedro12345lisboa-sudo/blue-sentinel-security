"""Gera as imagens OG (1200x630) dos artigos a partir do frontmatter MDX.

Uso (a raiz do repositório):

    python scripts/build_writeup_covers.py

Cada `frontend/content/pt/writeups/*.mdx` com `cover:` vira um PNG em
`frontend/public/images/writeups/<slug>.png`. A identidade visual usa os
tokens do site (`--bs-color-*` de tokens.css): fundo #0B1220, texto #E6EDF7,
destaque #3B82F6.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
WRITEUPS_DIR = ROOT / "frontend" / "content" / "pt" / "writeups"
OUT_DIR = ROOT / "frontend" / "public" / "images" / "writeups"

WIDTH, HEIGHT = 1200, 630

BG_TOP = (11, 18, 32)  # --bs-color-background-page
BG_BOTTOM = (23, 35, 61)  # --bs-color-background-elevated
TEXT = (230, 237, 247)  # --bs-color-text-primary
MUTED = (148, 163, 184)
PRIMARY = (59, 130, 246)  # --bs-color-primary-default

FONT_CANDIDATES_BOLD = (
    r"C:\Windows\Fonts\segoeuib.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
)
FONT_CANDIDATES_REGULAR = (
    r"C:\Windows\Fonts\segoeui.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/Library/Fonts/Arial.ttf",
)
FONT_CANDIDATES_MONO = (
    r"C:\Windows\Fonts\consola.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
)


def load_font(candidates: tuple[str, ...], size: int) -> ImageFont.FreeTypeFont:
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    raise SystemExit(f"nenhuma fonte encontrada (testadas: {', '.join(candidates)})")


def parse_frontmatter(path: Path) -> dict[str, str]:
    raw = path.read_text(encoding="utf-8")
    match = re.match(r"^---\n(.*?)\n---\n", raw, flags=re.S)
    if not match:
        raise SystemExit(f"{path.name}: frontmatter ausente")
    data: dict[str, str] = {}
    for line in match.group(1).splitlines():
        key_value = re.match(r"^([A-Za-z_]+):\s*(.+)$", line)
        if not key_value:
            continue
        key, value = key_value.group(1), key_value.group(2).strip()
        if value.startswith("[") and value.endswith("]"):
            value = ",".join(
                part.strip().strip("'\"")
                for part in value[1:-1].split(",")
                if part.strip()
            )
        else:
            value = value.strip("'\"")
        data[key] = value
    return data


def gradient_background() -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), BG_TOP)
    draw = ImageDraw.Draw(image)
    for y in range(HEIGHT):
        ratio = y / HEIGHT
        color = tuple(
            int(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * ratio) for i in range(3)
        )
        draw.line([(0, y), (WIDTH, y)], fill=color)
    return image


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if draw.textlength(candidate, font=font) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_spaced(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, font: ImageFont.FreeTypeFont, fill: tuple[int, ...], spacing: int = 4) -> int:
    x, y = xy
    for char in text:
        draw.text((x, y), char, font=font, fill=fill)
        x += int(draw.textlength(char, font=font)) + spacing
    return x


def chip(draw: ImageDraw.ImageDraw, x: int, y: int, label: str, font: ImageFont.FreeTypeFont, accent: tuple[int, ...]) -> int:
    pad_x, pad_y, radius = 16, 9, 14
    width = int(draw.textlength(label, font=font)) + pad_x * 2
    height = font.size + pad_y * 2
    draw.rounded_rectangle([x, y, x + width, y + height], radius=radius, outline=accent + (255,), width=2)
    draw.text((x + pad_x, y + pad_y - 2), label, font=font, fill=MUTED)
    return width + 12


def render(cover_path: Path, title: str, series: str, tags: list[str]) -> None:
    image = gradient_background().convert("RGBA")
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    accent = PRIMARY
    part_match = re.search(r"Parte (\d)", series)
    part_number = part_match.group(1) if part_match else ""

    # Brilho circular no canto superior direito
    glow = Image.new("RGBA", (900, 900), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse([0, 0, 900, 900], fill=accent + (26,))
    image.alpha_composite(glow, (WIDTH - 420, -360))

    # Numeral da parte, translúcido, à direita
    if part_number:
        num_font = load_font(FONT_CANDIDATES_BOLD, 460)
        num = part_number
        num_width = draw.textlength(num, font=num_font)
        draw.text(
            (WIDTH - num_width - 64, HEIGHT - 470),
            num,
            font=num_font,
            fill=accent + (34,),
        )

    # Moldura e barra de destaque
    draw.rectangle([48, 48, WIDTH - 48, HEIGHT - 48], outline=(148, 163, 184, 60), width=2)
    draw.rounded_rectangle([84, 96, 94, 460], radius=5, fill=accent)

    # Cabeçalho: wordmark + série
    word_font = load_font(FONT_CANDIDATES_BOLD, 30)
    end_x = draw_spaced(draw, (124, 92), "BLUE-SENTINEL", word_font, TEXT, spacing=6)
    draw.ellipse([end_x + 4, 100, end_x + 20, 116], fill=accent)

    if series:
        series_font = load_font(FONT_CANDIDATES_REGULAR, 24)
        draw.text((124, 140), series, font=series_font, fill=MUTED)

    # Título: reduz a fonte até caber em até 4 linhas
    max_width = WIDTH - 320
    title_y = 210
    size = 64
    while size >= 34:
        title_font = load_font(FONT_CANDIDATES_BOLD, size)
        lines = wrap_text(draw, title, title_font, max_width)
        line_height = int(size * 1.18)
        if len(lines) <= 4 and len(lines) * line_height <= HEIGHT - title_y - 140:
            break
        size -= 4
    for index, line in enumerate(lines):
        draw.text(
            (124, title_y + index * line_height),
            line,
            font=title_font,
            fill=TEXT,
        )

    # Tags como chips no rodapé
    if tags:
        tag_font = load_font(FONT_CANDIDATES_MONO, 21)
        x, y = 124, HEIGHT - 108
        for tag in tags[:4]:
            x += chip(draw, x, y, tag, tag_font, accent)

    image.alpha_composite(overlay)
    image.convert("RGB").save(cover_path, "PNG", optimize=True)


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    generated = 0
    for mdx in sorted(WRITEUPS_DIR.glob("*.mdx")):
        frontmatter = parse_frontmatter(mdx)
        cover = frontmatter.get("cover", "")
        if not cover:
            continue
        title = frontmatter.get("title", mdx.stem)
        series = frontmatter.get("series", "")
        tags = [t for t in frontmatter.get("tags", "").split(",") if t]
        target = ROOT / "frontend" / "public" / cover.lstrip("/")
        render(target, title, series, tags)
        print(f"cover: {target.relative_to(ROOT)}")
        generated += 1
    print(f"{generated} capa(s) gerada(s) em {OUT_DIR.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
