"""Build and reopen a fresh city using only city sources and installed game assets."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import runpy
import sys

import bpy


def inspect(file, output, assets):
    bpy.ops.wm.open_mainfile(filepath=str(file))
    dependencies = []
    for library in bpy.data.libraries:
        target = Path(bpy.path.abspath(library.filepath)).resolve()
        if not target.is_file() or not target.is_relative_to(output / 'city'):
            raise ValueError(f'City library escaped its own output: {target}')
        dependencies.append(str(target))
    for image in bpy.data.images:
        if image.source != 'FILE' or image.packed_file or not image.filepath:
            continue
        target = Path(bpy.path.abspath(image.filepath, library=image.library)).resolve()
        if not target.is_file() or not target.is_relative_to(assets):
            raise ValueError(f'City image is not an installed game asset: {target}')
        dependencies.append(str(target))
    return {'file': str(file), 'objects': len(bpy.data.objects), 'dependencies': sorted(set(dependencies))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--files-root', required=True)
    parser.add_argument('--output-root', required=True)
    parser.add_argument('--report', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    files = Path(args.files_root).resolve()
    output = Path(args.output_root).resolve()
    if not output.is_relative_to(files / 'city-candidates') or output == files / 'city-candidates' or output.exists():
        raise ValueError('City validation requires a fresh directory inside blender_files/city-candidates')
    if os.name == 'nt':
        import ctypes
        kernel = ctypes.windll.kernel32
        kernel.SetPriorityClass(kernel.GetCurrentProcess(), 0x00004000)
    os.environ['BLENDER_FILES_ROOT'] = str(output)
    scripts = Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(scripts))
    from common import paths as BP
    BP.add_import_paths(__file__)
    import city_site as CS
    output.mkdir(parents=True)
    empty_start = not any(output.iterdir())
    for name in ('build_context.py', 'build_city.py'):
        sys.argv = [__file__, '--']
        runpy.run_path(str(scripts / 'city' / name), run_name='__main__')
    context = inspect(Path(CS.CONTEXT_LIBRARY), output, BP.ASSETS.resolve())
    if context['objects'] != 16 or bpy.data.libraries:
        raise ValueError('Context must contain fifteen trees and one street lamp without linked libraries')
    city = inspect(Path(CS.CITY_BLEND), output, BP.ASSETS.resolve())
    if any(obj.type in ('CAMERA', 'LIGHT') for obj in bpy.context.scene.objects):
        raise ValueError('The reusable city must not contain a composition camera or lamp')
    if not all(name in bpy.data.collections for name in (*CS.CITY_COLLECTIONS, CS.SITE_FURNITURE)):
        raise ValueError('City collections are incomplete')
    sources = sorted({str(Path(module.__file__).resolve()) for module in sys.modules.values()
                      if getattr(module, '__file__', None) and Path(module.__file__).resolve().is_relative_to(scripts)})
    if any(not (Path(source).is_relative_to(scripts / 'city') or Path(source).is_relative_to(scripts / 'common'))
           for source in sources):
        raise ValueError(f'City imported hero code: {sources}')
    if {entry.name for entry in output.iterdir()} != {'city'}:
        raise ValueError('The clean candidate root acquired non-city data')
    rows = [context, city, {'file': CS.SITE_JSON}]
    for row in rows:
        with open(row['file'], 'rb') as stream:
            row['sha256'] = hashlib.file_digest(stream, 'sha256').hexdigest()
    report = {'passed': True, 'empty_start': empty_start, 'output_root': str(output),
              'hero_files_present': False, 'imported_sources': sources, 'files': rows,
              'render_parity': 'requires separate AI 651 six-view comparison'}
    Path(args.report).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
