"""Resolve authoring materials through the installed JavaScript catalog; no folder fallback."""
from functools import lru_cache
import json
import os
from pathlib import Path
import shutil
import subprocess

from common import paths as BP


@lru_cache(maxsize=1)
def _catalog():
    node = shutil.which('node')
    if not node:
        raise RuntimeError('Node.js must be on PATH to read the installed game PBR catalog')
    result = subprocess.run([node, BP.script('common/material_catalog.mjs')], cwd=BP.ROOT,
                            capture_output=True, text=True, check=True,
                            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    return {entry['materialId']: entry for entry in json.loads(result.stdout)}


class Material:
    def __init__(self, name):
        material_id = name if name.startswith('pbr.') else 'pbr.' + name
        try:
            self.entry = _catalog()[material_id]
        except KeyError:
            raise ValueError(f'{material_id} is not installed in assets/public/pbr/_catalog_index.js') from None
        self.folder = BP.ASSETS / 'public/pbr' / material_id.removeprefix('pbr.')

    def map(self, key):
        filename = self.entry.get('mapFiles', {}).get(key)
        if filename:
            file = self.folder / filename
        else:
            filename = self.entry.get('auxiliaryMapFiles', {}).get(key) or self.entry.get('allMapFiles', {}).get(key)
            if not isinstance(filename, str):
                raise ValueError(f'{self.entry["materialId"]} has no catalog map {key}')
            file = Path(BP.ROOT) / filename if filename.startswith('assets/') else self.folder / filename
        file = file.resolve()
        if not file.is_relative_to(self.folder.resolve()) or not file.is_file():
            raise FileNotFoundError(f'Invalid or missing installed {self.entry["materialId"]}/{key}: {file}')
        return str(file)


def material(name):
    return Material(name)
