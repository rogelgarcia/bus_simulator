"""Rebuild the independent city context, city and site descriptor in order."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common.rebuild_pipeline import main


def stages(build):
    build.blender('city-context', 'city/build_context.py')
    build.blender('city', 'city/build_city.py')


if __name__ == '__main__':
    main('city')
