"""Erzeugt App-Icons aus build/logo-source.png (Fallback: gemaltes Icon).

Aufruf:  python scripts/make-icons.py
"""

from __future__ import annotations

import struct
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
ICONS = BUILD / "icons"
ASSETS = ROOT / "src" / "renderer" / "assets"
SOURCE = BUILD / "logo-source.png"

SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)

BACKGROUND_TOP = (18, 26, 40)
BACKGROUND_BOTTOM = (31, 46, 69)
ACCENT = (127, 208, 255)


def fallback_icon(size: int) -> Image.Image:
    """Einfaches Ersatz-Icon, falls kein Logo vorliegt."""
    scale = 4
    big = size * scale
    canvas = Image.new("RGB", (big, big), BACKGROUND_TOP)
    draw = ImageDraw.Draw(canvas)
    for y in range(big):
        ratio = y / max(1, big - 1)
        color = tuple(
            round(BACKGROUND_TOP[i] + (BACKGROUND_BOTTOM[i] - BACKGROUND_TOP[i]) * ratio)
            for i in range(3)
        )
        draw.line([(0, y), (big, y)], fill=color)
    canvas = canvas.convert("RGBA")
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, big - 1, big - 1], radius=int(big * 0.22), fill=255)
    canvas.putalpha(mask)

    draw = ImageDraw.Draw(canvas)
    unit = big
    stroke = int(unit * 0.085)

    def p(x: float, y: float) -> tuple[float, float]:
        return (x * unit, y * unit)

    draw.line(
        [p(0.24, 0.70), p(0.24, 0.33), p(0.39, 0.55), p(0.54, 0.33), p(0.54, 0.70)],
        fill=ACCENT,
        width=stroke,
        joint="curve",
    )
    draw.line([p(0.75, 0.30), p(0.75, 0.59)], fill=(255, 255, 255), width=int(unit * 0.07))
    draw.polygon([p(0.655, 0.54), p(0.845, 0.54), p(0.75, 0.74)], fill=(255, 255, 255))
    return canvas.resize((size, size), Image.LANCZOS)


def load_logo() -> Image.Image | None:
    if not SOURCE.exists():
        return None
    logo = Image.open(SOURCE).convert("RGBA")
    bbox = logo.getchannel("A").getbbox()
    if bbox:
        logo = logo.crop(bbox)

    side = max(logo.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(logo, ((side - logo.width) // 2, (side - logo.height) // 2), logo)
    return square


def render_logo(logo: Image.Image, size: int) -> Image.Image:
    # Kleine Größen brauchen weniger Rand, sonst verschwindet das Motiv.
    padding = 0 if size <= 32 else (1 if size <= 64 else 2)
    inner = max(1, size - padding * 2)
    scaled = logo.resize((inner, inner), Image.LANCZOS)
    if padding == 0:
        return scaled
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(scaled, (padding, padding), scaled)
    return canvas


def write_ico(images: list[tuple[int, Image.Image]], destination: Path) -> None:
    entries = []
    payloads = []
    for size, image in images:
        tmp = destination.with_suffix(f".{size}.tmp.png")
        image.save(tmp, format="PNG")
        payloads.append(tmp.read_bytes())
        tmp.unlink()

    header = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    for (size, _image), payload in zip(images, payloads):
        dimension = 0 if size >= 256 else size
        entries.append(struct.pack("<BBBBHHII", dimension, dimension, 0, 0, 1, 32, len(payload), offset))
        offset += len(payload)

    destination.write_bytes(header + b"".join(entries) + b"".join(payloads))


def main() -> None:
    BUILD.mkdir(parents=True, exist_ok=True)
    ICONS.mkdir(parents=True, exist_ok=True)
    ASSETS.mkdir(parents=True, exist_ok=True)

    logo = load_logo()
    build_icon = (lambda size: render_logo(logo, size)) if logo else fallback_icon
    print("Quelle:", SOURCE if logo else "Fallback-Zeichnung")

    rendered = {}
    for size in SIZES:
        rendered[size] = build_icon(size)
        rendered[size].save(ICONS / f"{size}x{size}.png", format="PNG")

    rendered[512].save(BUILD / "icon.png", format="PNG")
    write_ico([(size, build_icon(size)) for size in ICO_SIZES], BUILD / "icon.ico")

    # Logo für die Oberfläche (Website-Button, Favicon)
    build_icon(96).save(ASSETS / "logo.png", format="PNG")
    build_icon(64).save(ASSETS / "logo-64.png", format="PNG")

    print(f"Icons erstellt in {ICONS} und {BUILD}\\icon.ico; UI-Logo in {ASSETS}")


if __name__ == "__main__":
    main()
