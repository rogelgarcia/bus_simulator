# Lays labeled images side by side, or on an N-up grid, at a common height for review composites (deterministic PNG output).
import argparse
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT_CANDIDATES = ("C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf")
BACKGROUND = (18, 22, 27)
LABEL_BACKGROUND = (28, 34, 42)
TEXT = (232, 237, 242)
GUTTER = 8
PADDING = 12


def load_font(size):
    for candidate in FONT_CANDIDATES:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default(size)


def parse_item(value):
    label, separator, image = value.partition("=")
    if not separator or not label.strip() or not image.strip():
        raise SystemExit(f"[composite] expected <label>=<image>, received {value!r}")
    path = Path(image.strip())
    if not path.is_file():
        raise SystemExit(f"[composite] image not found: {path}")
    return label.strip(), path


def scale_to_height(image, height):
    width = max(1, round(image.width * height / image.height))
    return image.resize((width, height), Image.Resampling.LANCZOS)


def draw_label(draw, font, box, text):
    x, y, width, height = box
    draw.rectangle((x, y, x + width - 1, y + height - 1), fill=LABEL_BACKGROUND)
    left, top, right, bottom = font.getbbox(text)
    draw.text((x + PADDING - left, y + (height - (bottom - top)) / 2 - top), text, font=font, fill=TEXT)


def compose(items, height, label_height, title, columns):
    images = [(label, scale_to_height(Image.open(path).convert("RGB"), height)) for label, path in items]
    columns = columns or len(images)
    rows = math.ceil(len(images) / columns)
    cell_width = max(image.width for _, image in images) if columns < len(images) or rows > 1 else None
    widths = [cell_width or image.width for _, image in images]
    row_widths = [sum(widths[row * columns:(row + 1) * columns]) + GUTTER * (min(columns, len(images) - row * columns) - 1) for row in range(rows)]
    cell_height = label_height + height
    title_height = round(label_height * 1.25) if title else 0
    sheet = Image.new("RGB", (max(row_widths), title_height + rows * cell_height + GUTTER * (rows - 1)), BACKGROUND)
    draw = ImageDraw.Draw(sheet)
    font = load_font(max(10, round(label_height * 0.55)))
    if title:
        draw_label(draw, load_font(max(11, round(title_height * 0.55))), (0, 0, sheet.width, title_height), title)
    for index, (label, image) in enumerate(images):
        row, column = divmod(index, columns)
        x = sum(widths[row * columns:index]) + GUTTER * column
        y = title_height + row * (cell_height + GUTTER)
        width = widths[index]
        draw_label(draw, font, (x, y, width, label_height), label)
        sheet.paste(image, (x + (width - image.width) // 2, y + label_height))
    return sheet


def main(argv):
    parser = argparse.ArgumentParser(description="Side-by-side or grid composite of labeled review images at a common height.")
    parser.add_argument("--output", required=True, help="PNG to write")
    parser.add_argument("--label-height", type=int, default=36, help="label strip height in pixels (12-200)")
    parser.add_argument("--height", type=int, default=720, help="common image height in pixels (64-4320)")
    parser.add_argument("--title", default=None, help="optional title strip")
    parser.add_argument("--grid", type=int, default=None, help="columns for an N-up sheet (default: one row)")
    parser.add_argument("items", nargs="+", metavar="label=image", help="labeled PNG/JPG/WebP images in display order")
    args = parser.parse_args(argv)
    if not 12 <= args.label_height <= 200:
        raise SystemExit("[composite] --label-height must lie in 12..200")
    if not 64 <= args.height <= 4320:
        raise SystemExit("[composite] --height must lie in 64..4320")
    if args.grid is not None and args.grid < 1:
        raise SystemExit("[composite] --grid needs at least one column")
    items = [parse_item(value) for value in args.items]
    output = Path(args.output)
    if output.suffix.lower() != ".png":
        raise SystemExit("[composite] --output must be a .png path")
    sheet = compose(items, args.height, args.label_height, args.title, args.grid)
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, format="PNG")
    print(f"[composite] {sheet.width}x{sheet.height} -> {output.as_posix()}")


if __name__ == "__main__":
    main(sys.argv[1:])
