#!/usr/bin/env python3
"""アプリアイコンのマスター SVG から配布用アセットを生成する。

出力:
  build/appicon.png            1024x1024 (Wails が Linux/macOS 用に使う)
  build/windows/icon.ico       16/24/32/48/64/128/256 のマルチサイズ
  frontend/public/favicon.svg  ブラウザ・Storybook 用
  frontend/public/favicon.png  32x32 フォールバック

32px 以下は icon-small.svg（簡略版）から起こす。端子ピンやグリップ溝は
その寸法では潰れて濁るだけなので、シルエットと ◈ だけを残している。

使い方: pip install pillow cairosvg && python3 design/app-icon/generate.py
"""
import io
import struct
from pathlib import Path

import cairosvg
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent

MASTER = HERE / "icon.svg"
MASTER_SMALL = HERE / "icon-small.svg"

ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
SMALL_THRESHOLD = 32  # これ以下は簡略版から起こす


def render(svg_path: Path, size: int) -> Image.Image:
    png = cairosvg.svg2png(url=str(svg_path), output_width=size, output_height=size)
    return Image.open(io.BytesIO(png)).convert("RGBA")


def write_ico(path: Path, images: list[Image.Image]) -> None:
    """サイズごとに別ソースを使いたいので ICO を直接組む（Pillow は1枚からしか作れない）。"""
    payloads = []
    for img in images:
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        payloads.append(buf.getvalue())

    offset = 6 + 16 * len(payloads)
    header = struct.pack("<HHH", 0, 1, len(payloads))
    entries = b""
    for img, data in zip(images, payloads):
        w = 0 if img.width >= 256 else img.width
        h = 0 if img.height >= 256 else img.height
        entries += struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(data), offset)
        offset += len(data)

    path.write_bytes(header + entries + b"".join(payloads))


def main() -> None:
    appicon = ROOT / "build" / "appicon.png"
    render(MASTER, 1024).save(appicon)
    print(f"wrote {appicon.relative_to(ROOT)} (1024x1024)")

    ico = ROOT / "build" / "windows" / "icon.ico"
    write_ico(ico, [render(MASTER_SMALL if s <= SMALL_THRESHOLD else MASTER, s)
                    for s in ICO_SIZES])
    print(f"wrote {ico.relative_to(ROOT)} ({'/'.join(map(str, ICO_SIZES))})")

    public = ROOT / "frontend" / "public"
    public.mkdir(exist_ok=True)
    (public / "favicon.svg").write_text(MASTER.read_text())
    render(MASTER_SMALL, 32).save(public / "favicon.png")
    print("wrote frontend/public/favicon.svg, frontend/public/favicon.png")


if __name__ == "__main__":
    main()
