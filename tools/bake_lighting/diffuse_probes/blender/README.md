# Blender probe stages

These Python stages are invoked by the registered bake jobs using the shared,
verified Blender configuration; use the parent or child `run.mjs` entrypoints.

- `validate.py` checks irradiance units and generated-image persistence.
- `prepare.py` reconstructs the authenticated static city, builds bounded
  visibility acceleration and six-direction receivers, then saves `probes.blend`.
- `bake.py` loads that prepared scene for one sky or indirect-bounce pass and
  writes floating-point irradiance plus an authenticated receipt.

Generated scenes, visibility fields and receipts belong to the framework's
ignored stage directories. They are never written next to these scripts.
