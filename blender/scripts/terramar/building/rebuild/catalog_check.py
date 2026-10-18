"""Build catalog-backed Terra & Mar candidates against the retained baseline and city."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import runpy
import shutil
import sys

import bpy


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-root', required=True)
    parser.add_argument('--output-root', required=True)
    parser.add_argument('--report', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    source = Path(args.source_root).resolve()
    output = Path(args.output_root).resolve()
    if output == source or not output.is_relative_to(source) or output.exists():
        raise ValueError('Catalog validation requires a fresh candidate directory inside blender_files')
    if os.name == 'nt':
        import ctypes
        kernel = ctypes.windll.kernel32
        kernel.SetPriorityClass(kernel.GetCurrentProcess(), 0x00004000)
    os.environ['BLENDER_FILES_ROOT'] = str(output)
    scripts = next(p for p in Path(__file__).resolve().parents if (p / 'common/paths.py').is_file())
    sys.path.insert(0, str(scripts))
    from common import paths as BP
    BP.add_import_paths(__file__)
    output.mkdir(parents=True)
    for relative in ('terramar/baseline/terramar_recessed_before.blend', 'city/city.blend'):
        destination = output / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.open_mainfile(filepath=str(source / relative))
        bpy.ops.file.make_paths_absolute()
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(destination), relative_remap=True, compress=True)
    shutil.copyfile(source / 'city/city_site.json', output / 'city/city_site.json')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sys.argv = [__file__, '--', 'target=all']
    import build
    build.main()
    sys.argv = [__file__, '--']
    runpy.run_path(BP.script('terramar/composition/build_composition.py'), run_name='__main__')
    candidates = sorted(file for file in (output / 'terramar').rglob('*.blend') if 'baseline' not in file.parts)
    rows = []
    for file in candidates:
        bpy.ops.wm.open_mainfile(filepath=str(file))
        missing = [bpy.path.abspath(library.filepath) for library in bpy.data.libraries
                   if not Path(bpy.path.abspath(library.filepath)).is_file()]
        missing += [bpy.path.abspath(img.filepath, library=img.library) for img in bpy.data.images
                    if img.source == 'FILE' and not img.packed_file and img.filepath
                    and not Path(bpy.path.abspath(img.filepath, library=img.library)).is_file()]
        if missing:
            raise ValueError(f'Missing dependencies in {file}: {missing}')
        with file.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        rows.append({'file': str(file), 'sha256': digest, 'objects': len(bpy.data.objects),
                     'materials': len(bpy.data.materials), 'images': len(bpy.data.images)})
    if len(rows) != 7:
        raise ValueError(f'Expected five parts, one entry and one composition; got {len(rows)}')
    report = {'passed': True, 'render_parity': 'requires separate AI 651 comparison',
              'output_root': str(output), 'files': rows}
    Path(args.report).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
