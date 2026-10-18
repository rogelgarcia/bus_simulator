# Composition diagnostics

These tools inspect hero compositions; they are not dependencies of city construction. AI 652 Phase 4 moved them
from `city/` so the city source folder contains no hero-script or hero-file dependency.

- `front_line.py`: measures visible city buildings across each hero's still and flyover views.
- `parity_render.py` and `parity_compare.py`: fixed-seed OptiX stills and comparison sheets for AI 651 gates.
- `weather_check.py` and `weather_report.py`: hero/city weather namespace checks and their report.

Existing arguments are unchanged. Callers should use `validation/<script>.py` relative to `blender/scripts/`.
Outputs remain under ignored `tests/artifacts/screens/`; rendering never saves its input scene.
