"""Register preserved AI 652 building sets without re-encoding their installed maps."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import sys
import zipfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'blender/scripts'))
from common.material_catalog import material

SETS = {'terramar_continuous_limestone': '03_CONTINUOUS_LIMESTONE',
        'terramar_sign_coastal_kitchen': '02_COASTAL_KITCHEN',
        'terramar_sign_terra_and_mar': '01_TERRA_AND_MAR'}


def hashes(data):
    return {'bytes': len(data), 'md5': hashlib.md5(data).hexdigest(), 'sha256': hashlib.sha256(data).hexdigest()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--terramar-zip', required=True)
    parser.add_argument('--bradbury-zip', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--install', action='store_true')
    args = parser.parse_args()
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    archives = {'terramar': Path(args.terramar_zip), 'bradbury': Path(args.bradbury_zip)}
    raw = {name: path.read_bytes() for name, path in archives.items()}
    if hashes(raw['terramar'])['md5'] != 'cc7c7315fd820fa6b1b5b43e602b9f91':
        raise ValueError('Terra & Mar kit differs from the retained source archive')
    if hashes(raw['bradbury'])['md5'] != 'f3341ebba86c1486bd43fc85f664aae3':
        raise ValueError('Bradbury lettering differs from the retained source archive')
    changes, records = [], []
    with zipfile.ZipFile(io.BytesIO(raw['terramar'])) as archive:
        for slug, folder in SETS.items():
            entry = material(slug)
            prefix = f'Terra_Mar_PBR_Kit/{folder}/'
            names = {'baseColor': 'basecolor.png', 'normal': 'normal_opengl.png', 'orm': 'orm.png', 'height': 'height_16bit.png'}
            for key, name in names.items():
                if Path(entry.map(key)).read_bytes() != archive.read(prefix + name):
                    raise ValueError(f'Installed {slug}/{key} differs from its archive; refusing to replace it')
            source_path = entry.folder / 'source.json'
            source = json.loads(source_path.read_text())
            source.update(registeredInCatalog=True, catalogRegistrationDate='2026-10-17', author=None, url=None,
                          origin='AI-generated kit supplied by the project owner on 2026-10-12; original download URL not supplied',
                          license='unspecified; AI-generated output supplied by the project owner')
            source['archive'].update(hashes(raw['terramar']))
            source['archive']['retained_source'] = 'blender_inputs/terramar/kit_source/Terra_Mar_PBR_Kit.zip'
            if slug.startswith('terramar_sign_'):
                opacity = archive.read(prefix + 'opacity.png')
                alpha = np.asarray(Image.open(entry.map('baseColor')))[..., 3]
                if not np.array_equal(alpha, np.asarray(Image.open(io.BytesIO(opacity))).squeeze()):
                    raise ValueError(f'{slug}: opacity differs from installed base-color alpha')
                changes.append((entry.folder / 'opacity.png', opacity))
                source['files'] = [f for f in source['files'] if f['file'] != 'opacity.png'] + [
                    {'file': 'opacity.png', 'from': folder + '/opacity.png', **hashes(opacity)}]
            changes.append((source_path, (json.dumps(source, indent=2) + '\n').encode()))
            records.append({'slug': slug, 'maps_preserved': True, 'source': source})
    entry = material('bradbury_lettering')
    source = {'asset': 'Bradbury portal inscription BRADBURY.', 'origin': 'AI-generated lettering pack supplied by the project owner on 2026-09-18',
              'author': None, 'url': None, 'license': 'unspecified; AI-generated output supplied by the project owner',
              'archive': {'name': 'bradbury_lettering_PBR.zip', **hashes(raw['bradbury']),
                          'retained_source': 'blender_inputs/bradbury/lettering_source/bradbury_lettering_PBR.zip'},
              'date': '2026-10-17', 'registeredInCatalog': True,
              'transformation': 'Existing installed maps preserved: nine glyphs respaced by +20 px per gap on 2026-09-22; ORM packs AO, roughness, zero metalness. See tracked make_lettering_pbr.py and retained README.',
              'files': [{'file': p.name, **hashes(p.read_bytes())} for p in sorted(entry.folder.iterdir()) if p.is_file() and p.suffix == '.png']}
    changes.append((entry.folder / 'source.json', (json.dumps(source, indent=2) + '\n').encode()))
    records.append({'slug': 'bradbury_lettering', 'maps_preserved': True, 'source': source})
    for target, data in changes:
        staged = output / target.relative_to(ROOT)
        staged.parent.mkdir(parents=True, exist_ok=True)
        staged.write_bytes(data)
    receipt = {'validated': True, 'installed': args.install, 'materials': records,
               'changes': [{'file': target.relative_to(ROOT).as_posix(), **hashes(data)} for target, data in changes]}
    if args.install:
        for target, data in changes:
            if target.exists() and target.name == 'opacity.png' and target.read_bytes() != data:
                raise ValueError(f'Conflicting installed opacity map: {target}')
        for target, data in changes:
            target.write_bytes(data)
    (output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({'validated': True, 'installed': args.install, 'sets': len(records), 'changes': len(changes)}))


if __name__ == '__main__':
    main()
