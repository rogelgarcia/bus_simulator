"""Reopen every regenerated blend and reject dependencies outside its clean build or installed assets."""
import hashlib
import json
from pathlib import Path
import sys
import bpy

output, report, domains = sys.argv[sys.argv.index('--') + 1:]
output, report = Path(output).resolve(), Path(report).resolve()
root = Path(__file__).resolve().parents[3]
assets = (root / 'assets').resolve()
rows = []
for file in sorted(output.rglob('*.blend')):
    bpy.ops.wm.open_mainfile(filepath=str(file))
    dependencies = []
    for library in bpy.data.libraries:
        target = Path(bpy.path.abspath(library.filepath)).resolve()
        if not target.is_file() or not target.is_relative_to(output):
            raise ValueError(f'{file}: library outside the clean rebuild: {target}')
        dependencies.append(str(target))
    for image in bpy.data.images:
        if image.source != 'FILE' or image.packed_file or not image.filepath:
            continue
        target = Path(bpy.path.abspath(image.filepath, library=image.library)).resolve()
        if not target.is_file() or not (target.is_relative_to(output) or target.is_relative_to(assets)):
            raise ValueError(f'{file}: missing or non-reproducible image: {target}')
        dependencies.append(str(target))
    top = [collection.name for collection in bpy.context.scene.collection.children]
    for hero in ('bradbury', 'terramar'):
        if file.name == f'{hero}_building.blend' and top != [hero.upper() + '_BUILDING']:
            raise ValueError(f'Unexpected building entry collections: {file}: {top}')
    rows.append({'file': str(file), 'objects': len(bpy.data.objects), 'top_collections': top,
                 'dependencies': sorted(set(dependencies))})
for domain in domains.split(','):
    required = ['city.blend', 'city_context_library.blend', 'city_site.json'] if domain == 'city' else [f'{domain}_building.blend', f'{domain}_city_composition.blend']
    if any(not (output / domain / name).is_file() for name in required):
        raise ValueError(f'Missing outputs for {domain}')
files = []
for file in sorted(output.rglob('*')):
    if not file.is_file():
        continue
    if file.suffix.startswith('.blend') and file.suffix != '.blend':
        raise ValueError(f'Unexpected automatic backup: {file}')
    with file.open('rb') as stream:
        files.append({'file': str(file), 'bytes': file.stat().st_size, 'sha256': hashlib.file_digest(stream, 'sha256').hexdigest()})
report.write_text(json.dumps({'passed': True, 'output_root': str(output), 'blends': rows, 'files': files}, indent=2), encoding='utf-8')
print(f'REBUILD VALIDATED: {len(rows)} blends, {len(files)} files')
