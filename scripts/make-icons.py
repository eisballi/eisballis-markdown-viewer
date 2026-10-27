"""Erzeugt das App-Icon (PNG-Sätze + Windows-ICO) ohne externe Assets.

Aufruf:  python scripts/make-icons.py
"""

from __future__ import annotations

import struct
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
ICONS = BUILD / "icons"

SUPERSAMPLE = 4
SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024]

BACKGROUND_TOP = (18, 26, 40)
BACKGROUND_BOTTOM = (31, 46, 69)
ACCENT = (127, 208, 255)


def vertical_gradient(size: int, top, bottom) -> Image.Image:
    image = Image.new("RGB", (size, size))
    draw = ImageDraw.Draw(image)
    for y in range(size):
        ratio = y / max(1, size - 1)
        color = tuple(round(top[i] + (bottom[i] - top[i]) * ratio) for i in range(3))
        draw.line([(0, y), (size, y)], fill=color)
    return image


def render(size: int) -> Image.Image:
    big = size * SUPERSAMPLE
    canvas = vertical_gradient(big, BACKGROUND_TOP, BACKGROUND_BOTTOM).convert("RGBA")

    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, big - 1, big - 1], radius=int(big * 0.22), fill=255
    )
    canvas.putalpha(mask)

    draw = ImageDraw.Draw(canvas)
    unit = big
    stroke = int(unit * 0.085)

    def p(x: float, y: float) -> tuple[float, float]:
        return (x * unit, y * unit)

    # "M"
    draw.line(
        [p(0.24, 0.70), p(0.24, 0.33), p(0.39, 0.55), p(0.54, 0.33), p(0.54, 0.70)],
        fill=ACCENT,
        width=stroke,
        joint="curve",
    )
    # Pfeil nach unten
    draw.line([p(0.75, 0.30), p(0.75, 0.59)], fill=(255, 255, 255), width=int(unit * 0.07))
    draw.polygon(
        [p(0.655, 0.54), p(0.845, 0.54), p(0.75, 0.74)],
        fill=(255, 255, 255),
    )

    return canvas.resize((size, size), Image.LANCZOS)


def write_ico(images: list[tuple[int, Image.Image]], destination: Path) -> None:
    entries = []
    payloads = []
    for size, image in images:
        png_path = destination.with_suffix(f".{size}.png")
        image.save(png_path, format="PNG")
        payloads.append(png_path.read_bytes())
        png_path.unlink()

    header = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    for (size, _image), payload in zip(images, payloads):
        dimension = 0 if size >= 256 else size
        entries.append(
            struct.pack(
                "<BBBBHHII",
                dimension,
                dimension,
                0,
                0,
                1,
                32,
                len(payload),
                offset,
            )
        )
        offset += len(payload)

    destination.write_bytes(header + b"".join(entries) + b"".join(payloads))


def main() -> None:
    BUILD.mkdir(parents=True, exist_ok=True)
    ICONS.mkdir(parents=True, exist_ok=True)

    rendered: dict[int, Image.Image] = {}

    for size in SIZES:
        rendered[size] = render(size)
        rendered[size].save(ICONS / f"{size}x{size}.png", format="PNG")

    rendered[512].save(BUILD / "icon.png", format="PNG")
    write_ico([(size, rendered[size]) for size in (16, 32, 48, 64, 128, 256)], BUILD / "icon.ico")

    print(f"Icons erstellt: {BUILD / 'icon.png'}, {BUILD / 'icon.ico'}, {ICONS}")


if __name__ == "__main__":
    main()
