"""Launch an existing authoring script with the shared Blender configuration.

New baking workflows belong in tools/bake.mjs; this supplies the existing portal
render launcher's executable and canonical paths without a machine-specific command.
"""
import argparse
from pathlib import Path
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import paths


def main(argv):
    separator = argv.index('--') if '--' in argv else len(argv)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('script', help='Path relative to blender/scripts')
    parser.add_argument('--blend', help='Existing file relative to blender_files')
    args = parser.parse_args(argv[:separator])
    script = Path(paths.script(args.script)).resolve()
    if not script.is_relative_to(paths.SCRIPTS) or not script.is_file():
        parser.error('script must exist inside blender/scripts')
    command = [paths.blender_executable(), '--background', '--factory-startup', '--python-exit-code', '1']
    if args.blend:
        blend = Path(paths.files(args.blend)).resolve()
        if not blend.is_relative_to(paths.FILES) or not blend.is_file():
            parser.error('blend must exist inside blender_files')
        command.append(str(blend))
    command += ['--python', str(script), '--', *argv[separator + 1:]]
    return subprocess.call(command, cwd=paths.ROOT)


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
