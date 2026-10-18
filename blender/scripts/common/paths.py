"""Canonical roots for Blender authoring, shared data, inputs and render evidence."""
import os
import json
from pathlib import Path
import sys

SCRIPTS = Path(__file__).resolve().parent.parent
ROOT = str(SCRIPTS.parent.parent)
FILES = Path(os.environ.get('BLENDER_FILES_ROOT', str(Path(ROOT) / 'blender_files'))).resolve()
INPUTS = Path(ROOT) / 'blender_inputs'
ASSETS = Path(ROOT) / 'assets'
SCREENS = Path(os.environ.get('BLENDER_SCREENS_ROOT', str(Path(ROOT) / 'tests' / 'artifacts' / 'screens'))).resolve()


def files(*parts):
    return str(FILES.joinpath(*parts))


def inputs(*parts):
    return str(INPUTS.joinpath(*parts))


def script(*parts):
    return str(SCRIPTS.joinpath(*parts))


def assets(*parts):
    return str(ASSETS.joinpath(*parts))


def screens(*parts):
    return str(SCREENS.joinpath(*parts))


def blender_executable():
    config = Path(ROOT) / 'tools' / 'baking' / 'blender.local.json'
    executable = json.loads(config.read_text(encoding='utf-8-sig')).get('executable')
    if not executable:
        raise RuntimeError(f'Configure executable in {config}')
    path = Path(executable)
    if not path.is_absolute():
        path = Path(ROOT) / path
    if not path.is_file():
        raise FileNotFoundError(path)
    return str(path)


def font_path(name):
    directory = Path(os.environ['WINDIR']) / 'Fonts' if os.name == 'nt' else Path.home() / '.fonts'
    return str(directory / name)


def add_import_paths(source):
    relative = Path(source).resolve().relative_to(SCRIPTS)
    directories = [Path(source).resolve().parent]
    if relative.parts[0] in ('bradbury', 'terramar'):
        hero = SCRIPTS / relative.parts[0]
        directories += [hero / 'building', hero / 'building' / 'rebuild',
                        hero / 'composition', hero / 'render']
    directories.append(SCRIPTS / 'city')
    for directory in reversed(directories):
        path = str(directory)
        if directory.is_dir() and path not in sys.path:
            sys.path.insert(0, path)
