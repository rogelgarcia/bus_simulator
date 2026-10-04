# Encode packed linear canopy channels and independent-channel mipmaps as GPU BC textures.
import argparse
import hashlib
import io
import json
import struct
from pathlib import Path
import PIL
from PIL import Image

args = argparse.ArgumentParser()
args.add_argument('--directory', required=True)
directory = Path(args.parse_args().directory)
manifest = json.loads((directory / 'capture.json').read_text())
manifest['maps'] = []
manifest['encoder'] = {'name': 'Pillow BCn', 'version': PIL.__version__, 'mips': 'linear 2x2 box, channels independent, no normal renormalization'}
for variant in range(2):
    for channel, size, bands in [('albedo', 1024, 4), ('normal', 1024, 4), ('roughness', 1024, 4), ('visibility', 4096, 1)]:
        name = f'tile{variant}_{channel}'
        raw = (directory / (name + '.raw')).read_bytes()
        if len(raw) != size * size * bands:
            raise ValueError(f'Invalid raw capture {name}')
        image = Image.frombytes('RGBA' if bands == 4 else 'L', (size, size), raw)
        format_name = 'DXT5' if bands == 4 else 'DXT1'
        blocks, levels, header = [], [], None
        while True:
            width, height = image.size
            encoded_image = image.convert('RGB') if bands == 1 else image
            if width < 4:
                padded = Image.new(encoded_image.mode, (4, 4))
                for y in range(4):
                    for x in range(4):
                        padded.putpixel((x, y), encoded_image.getpixel((x % width, y % height)))
                encoded_image = padded
            stream = io.BytesIO()
            encoded_image.save(stream, format='DDS', pixel_format=format_name)
            data = stream.getvalue()
            if header is None:
                header = bytearray(data[:128])
            payload = data[128:]
            expected = max(1, (width + 3) // 4) * max(1, (height + 3) // 4) * (16 if bands == 4 else 8)
            if len(payload) != expected:
                raise ValueError(f'Invalid BC block count {name} {width}')
            blocks.append(payload)
            levels.append({'width': width, 'height': height, 'bytes': len(payload)})
            if width == 1:
                break
            image = Image.merge(image.mode, tuple(band.resize((width // 2, height // 2), Image.Resampling.BOX) for band in image.split()))
        struct.pack_into('<I', header, 8, struct.unpack_from('<I', header, 8)[0] | 0x20000)
        struct.pack_into('<I', header, 20, len(blocks[0]))
        struct.pack_into('<I', header, 28, len(levels))
        struct.pack_into('<I', header, 108, 0x1000 | 0x8 | 0x400000)
        data = bytes(header) + b''.join(blocks)
        file = name + '.dds'
        (directory / file).write_bytes(data)
        decoded = Image.open(io.BytesIO(data))
        if decoded.size != (size, size):
            raise ValueError('DDS round-trip dimensions changed')
        manifest['maps'].append({'variant': variant, 'channel': channel, 'file': file, 'format': 'BC3' if bands == 4 else 'BC1',
                                 'sha256': hashlib.sha256(data).hexdigest(), 'diskBytes': len(data), 'residentBytes': sum(len(b) for b in blocks),
                                 'mips': levels, 'userData': manifest['textureMetadata'][channel]})
manifest['residentBytes'] = sum(entry['residentBytes'] for entry in manifest['maps'])
manifest['diskBytes'] = sum(entry['diskBytes'] for entry in manifest['maps'])
manifest['uncompressedBytes'] = 2 * sum(sum(max(1, size >> i) ** 2 * bands for i in range(size.bit_length())) for size, bands in [(1024, 4)] * 3 + [(4096, 1)])
del manifest['textureMetadata']
(directory / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f"[GrassCanopyMaps] {manifest['uncompressedBytes']} -> {manifest['residentBytes']} GPU bytes, eight maps with full mip chains")
