# Reprocess illumination

`node tools/bake_lighting/illumination/reprocess/run.mjs` applies the current
filtering and encoding to authenticated, recovered enhanced sky/bounce samples.
It is an explicit maintenance leaf, outside the default full-bake tree.

Supply the original completed publication directory and its original UV layout:

```sh
node tools/bake_lighting/illumination/reprocess/run.mjs --set lighting/illumination/reprocess:publication=tests/artifacts/screens/<topic>/bake/<identity> --set lighting/illumination/reprocess:layout=tests/artifacts/screens/<topic>/unwrap/receiver-layout.json
```

The shared local configuration locates Blender. This operation does not run Cycles:
it exports the current city and requires exactly the original source, atlas,
profile and toolchain identity. Raw pass hashes and the completed publication
identity must verify. Changed geometry or lighting requires a fresh bake instead.
The source receipt must contain recovery sample hashes; a completed directory
without that record is rejected, even if its files have the expected names.
It stages new packages in the framework run directory; add `--publish` to install
them through the existing receiver publication validator. Original samples remain
unchanged. Ordinary full bakes use the same filtering automatically.
