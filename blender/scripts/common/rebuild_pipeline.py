"""Run isolated, sequential authoring stages from preserved inputs into a fresh generated root."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[3]
SCRIPTS = ROOT / 'blender/scripts'


class Rebuild:
    def __init__(self, target, args):
        self.target, self.args = target, args
        self.output = Path(args.output_root).resolve()
        self.evidence = Path(args.report).resolve().parent
        base = Path(args.files_root).resolve() / 'rebuild-candidates' / target
        if self.output == base or not self.output.is_relative_to(base) or self.output.exists():
            raise ValueError('Rebuild requires a new run directory inside blender_files/rebuild-candidates/<target>')
        if not self.evidence.is_relative_to(ROOT / 'tests/artifacts/screens'):
            raise ValueError('Rebuild evidence must stay under tests/artifacts/screens')
        self.output.mkdir(parents=True)
        self.evidence.mkdir(parents=True, exist_ok=True)
        runtime = ROOT / 'tests/artifacts/screens/baking_tmp' / hashlib.sha256(str(self.output).encode()).hexdigest()[:16]
        runtime.mkdir(exist_ok=False)
        self.env = {**os.environ, 'BLENDER_FILES_ROOT': str(self.output), 'BLENDER_SCREENS_ROOT': str(self.evidence),
                    'BLENDER_BUILD_ONLY': '1', 'BRADBURY_PYTHON': args.python, 'TM_TAG': 'before',
                    'TERRAMAR_SIGN_ROOT': str(self.output / 'terramar/derived/sign'),
                    'TERRAMAR_VEGETATION_ROOT': str(self.output / 'terramar/derived/vegetation'),
                    'TEMP': str(runtime), 'TMP': str(runtime), 'TMPDIR': str(runtime),
                    'BLENDER_USER_CONFIG': str(runtime / 'config'), 'BLENDER_USER_EXTENSIONS': str(runtime / 'extensions'),
                    'OPTIX_CACHE_PATH': str(runtime / 'optix-cache'), 'CUDA_CACHE_PATH': str(runtime / 'cuda-cache'),
                    'PYTHONPATH': '', 'PYTHONHOME': '', 'PYTHONDONTWRITEBYTECODE': '1'}
        self.env.pop('BRADBURY_CAPITAL_STAGE', None)
        self.steps = []

    def run(self, name, executable, arguments):
        log = self.evidence / f'{len(self.steps):02d}-{name}.log'
        start = time.monotonic()
        print(f'REBUILD START {name}: {log}', flush=True)
        flags = (subprocess.CREATE_NO_WINDOW | subprocess.BELOW_NORMAL_PRIORITY_CLASS) if os.name == 'nt' else 0
        with log.open('x', encoding='utf-8') as stream:
            process = subprocess.run([executable, *map(str, arguments)], cwd=ROOT, env=self.env, stdout=stream,
                                     stderr=subprocess.STDOUT, creationflags=flags)
        row = {'stage': name, 'exit_code': process.returncode, 'seconds': round(time.monotonic() - start, 2), 'log': str(log)}
        self.steps.append(row)
        (self.evidence / 'rebuild-progress.json').write_text(json.dumps(self.steps, indent=2), encoding='utf-8')
        if process.returncode:
            raise RuntimeError(f'{name} failed ({process.returncode}); inspect {log}')
        print(f'REBUILD DONE {name}: {row["seconds"]}s', flush=True)

    def blender(self, name, script, arguments=()):
        self.run(name, self.args.blender, ['--background', '--factory-startup', '--threads', '2', '--disable-autoexec',
                 '--offline-mode', '--python-exit-code', '1', '--python', SCRIPTS / script, '--', *arguments])

    def python(self, name, script, arguments=()):
        self.run(name, self.args.python, ['-I', SCRIPTS / script, *arguments])


def main(target):
    parser = argparse.ArgumentParser()
    for name in ('files-root', 'output-root', 'report', 'blender', 'python', 'node'):
        parser.add_argument('--' + name, required=True)
    args = parser.parse_args()
    build = Rebuild(target, args)
    from importlib.util import spec_from_file_location, module_from_spec
    domains = ['city'] + (['bradbury', 'terramar'] if target == 'all' else [target] if target != 'city' else [])
    for domain in domains:
        spec = spec_from_file_location(f'{domain}_rebuild', SCRIPTS / domain / 'rebuild_all.py')
        module = module_from_spec(spec)
        spec.loader.exec_module(module)
        module.stages(build)
    build.blender('validate', 'common/validate_rebuild.py', [str(build.output), args.report, ','.join(domains)])
    report = json.loads(Path(args.report).read_text())
    report.update(empty_start=True, target=target, steps=build.steps, render_parity='requires AI 651 six-view comparison')
    Path(args.report).write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({'passed': report['passed'], 'output_root': str(build.output), 'blends': len(report['blends'])}), flush=True)
