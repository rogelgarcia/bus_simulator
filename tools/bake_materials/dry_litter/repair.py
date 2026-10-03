"""Repair the known truncated litter data maps, preserving every complete source row."""
import argparse
import hashlib
import io
import json
import struct
import zlib
from pathlib import Path

from PIL import Image, ImageFile


def partial_png(path, channels, expected_rows):
    data = path.read_bytes()
    if data[:8] != b'\x89PNG\r\n\x1a\n' or struct.unpack('>II', data[16:24]) != (1024, 1024):
        raise ValueError('Unexpected source PNG dimensions')
    pos, chunks = 8, []
    while pos + 8 <= len(data):
        count = struct.unpack('>I', data[pos:pos + 4])[0]
        if data[pos + 4:pos + 8] == b'IDAT':
            chunks.append(data[pos + 8:min(pos + 8 + count, len(data))])
        pos += count + 12
    decoder = zlib.decompressobj()
    raw = decoder.decompress(b''.join(chunks))
    rows = len(raw) // (1024 * channels + 1)
    if decoder.eof or rows != expected_rows:
        raise ValueError('Source no longer matches the documented truncation; reassess the repair')
    previous = ImageFile.LOAD_TRUNCATED_IMAGES
    try:
        ImageFile.LOAD_TRUNCATED_IMAGES = True
        image = Image.open(io.BytesIO(data)); image.load()
    finally:
        ImageFile.LOAD_TRUNCATED_IMAGES = previous
    return image, rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    orm, rows = partial_png(args.source / 'orm_truncated.png', 3, 939)
    roughness, rough_rows = partial_png(args.source / 'roughness_truncated.png', 1, 358)
    ao = Image.open(args.source / 'ao.png'); ao.load()
    if ao.size != (1024, 1024) or ao.mode != 'L' or orm.mode != 'RGB' or roughness.mode != 'L':
        raise ValueError('Unexpected source channels')
    old = orm.tobytes(); ambient = ao.tobytes()
    green = bytearray(old[1::3]); valid = rows * 1024
    if bytes(green[:rough_rows * 1024]) != roughness.tobytes()[:rough_rows * 1024]:
        raise ValueError('Independent roughness source disagrees with recovered ORM')
    if old[:valid * 3:3] != ambient[:valid] or any(old[2:valid * 3:3]):
        raise ValueError('AO/metalness source contract changed')
    lower, upper = min(green[:valid]), max(green[:valid])
    if lower < 220 or upper > 255:
        raise ValueError('Recovered roughness is outside the authored dry/matte range')
    # Missing data cannot be recovered exactly. Bridge only the missing rows to
    # the opposite edge; retain the original roughness range and periodic join.
    for y in range(rows, 1024):
        t = (y - rows + 1) / (1024 - rows + 1)
        t = t * t * (3 - 2 * t)
        for x in range(1024):
            green[y * 1024 + x] = round(green[(rows - 1) * 1024 + x] * (1 - t) + green[x] * t)
    repaired = Image.merge('RGB', (ao, Image.frombytes('L', (1024, 1024), bytes(green)), Image.new('L', (1024, 1024), 0)))
    args.output.mkdir(parents=True, exist_ok=True)
    output = args.output / 'arm.png'; repaired.save(output, compress_level=9)
    # Decode strictly and verify actual channel bytes before publication.
    verified = Image.open(output); verified.load()
    red, g, blue = [channel.tobytes() for channel in verified.split()]
    if red != ambient or g[:valid] != old[1:valid * 3:3] or any(blue) or min(g) < lower or max(g) > upper:
        raise ValueError('Repaired material failed pixel validation')
    digest = lambda data: hashlib.sha256(data).hexdigest()
    report = dict(schema='bus-simulator.dry-litter-orm-repair', version=1, size=[1024, 1024],
                  preservedRoughnessRows=rows, reconstructedRoughnessRows=1024 - rows,
                  independentlyVerifiedRows=rough_rows, roughnessRangeBytes=[lower, upper],
                  method='Preserve complete ORM rows; smooth per-column bridge across missing tail to opposite edge. Exact AO from separate source, metallic zero.',
                  exactOriginalRoughnessRecovery=False,
                  sources={name: digest((args.source / name).read_bytes()) for name in ['orm_truncated.png', 'roughness_truncated.png', 'ao.png']},
                  outputSha256=digest(output.read_bytes()))
    (args.output / 'repair.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
