"""Compose AI 573 diagnostic evidence from unmodified game/fixture captures."""
import json
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3] / "artifacts/screens/ai573_stop_sign_shadow"


def pair(name, crop, output):
    before = Image.open(ROOT / "before" / f"{name}.png").convert("RGB")
    after = Image.open(ROOT / "after" / f"{name}.png").convert("RGB")
    result = Image.new("RGB", (1080, 480), "#171c22")
    draw = ImageDraw.Draw(result)
    for x, label, image in [(0, "Before", before), (540, "After", after)]:
        draw.text((x + 10, 10), label, fill="white")
        result.paste(image.crop(crop).resize((540, 450)), (x, 30))
    result.save(ROOT / output)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--connection-stage')
    args = parser.parse_args()
    if args.connection_stage:
        result = Image.new('RGB', (1620, 480), '#171c22')
        draw = ImageDraw.Draw(result)
        for index, (label, source) in enumerate([
            ('Previous attempt', 'after/game.png'),
            ('Smoothing off', f'{args.connection_stage}/point-diagnostic.png'),
            ('Independent prop depth', f'{args.connection_stage}/game.png')
        ]):
            draw.text((index * 540 + 10, 10), label, fill='white')
            result.paste(Image.open(ROOT / source).crop((780, 750, 1050, 975)).resize((540, 450)), (index * 540, 30))
        result.save(ROOT / args.connection_stage / 'connection-comparison.png')
        sheet = Image.new('RGB', (1280, 1925), '#171c22')
        draw = ImageDraw.Draw(sheet)
        results = []
        for index in range(5):
            name = f'pose_{index + 1:02}'
            previous = Image.open(ROOT / 'after' / f'{name}.png').convert('RGB')
            current = Image.open(ROOT / args.connection_stage / f'{name}.png').convert('RGB')
            difference = np.abs(np.asarray(previous, dtype=float) - np.asarray(current, dtype=float))
            results.append({'pose': name, 'rgbMeanAbsoluteDifference0to255': float(difference.mean()),
                            'percentPixelsChangedOver8': float(np.mean(difference.max(axis=2) > 8) * 100)})
            top = index * 385
            draw.text((10, top + 6), f'{name} - previous attempt', fill='white')
            draw.text((650, top + 6), 'Independent prop depth', fill='white')
            sheet.paste(previous.resize((640, 360)), (0, top + 25))
            sheet.paste(current.resize((640, 360)), (640, top + 25))
        sheet.save(ROOT / args.connection_stage / 'five-poses-comparison.jpg')
        (ROOT / args.connection_stage / 'visual-difference.json').write_text(json.dumps(results, indent=2))
        return
    pair("game", (780, 750, 1050, 975), "sign-shadow-comparison.png")
    sheet = Image.new("RGB", (1280, 1950), "#171c22")
    draw = ImageDraw.Draw(sheet)
    draw.text((8, 8), "Original filter", fill="white")
    draw.text((648, 8), "Corrected filter", fill="white")
    results = []
    for index in range(5):
        name = f"pose_{index + 1:02}"
        before = Image.open(ROOT / "before" / f"{name}.png").convert("RGB")
        after = Image.open(ROOT / "after" / f"{name}.png").convert("RGB")
        difference = np.abs(np.asarray(before, dtype=float) - np.asarray(after, dtype=float))
        results.append({"pose": name, "rgbMeanAbsoluteDifference0to255": float(difference.mean()),
                        "percentPixelsChangedOver8": float(np.mean(difference.max(axis=2) > 8) * 100)})
        top = 25 + index * 385
        draw.text((10, top + 6), name, fill="white")
        sheet.paste(before.resize((640, 360)), (0, top + 25))
        sheet.paste(after.resize((640, 360)), (640, top + 25))
    sheet.save(ROOT / "five-poses-comparison.jpg")
    (ROOT / "visual-difference.json").write_text(json.dumps(results, indent=2))
    oracle = Image.new("RGB", (768, 350), "#171c22")
    draw = ImageDraw.Draw(oracle)
    for index, (label, source) in enumerate([
        ("Before", "before/fixture/2-combined.png"),
        ("After", "after/fixture/2-combined.png"),
        ("Finite-disc ray reference", "after/fixture/2-combined-reference.png")
    ]):
        draw.text((index * 256 + 8, 8), label, fill="white")
        oracle.paste(Image.open(ROOT / source).resize((256, 320)), (index * 256, 30))
    oracle.save(ROOT / "fixture-comparison.png")


if __name__ == "__main__":
    main()
