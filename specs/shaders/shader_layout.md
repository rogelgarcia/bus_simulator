# Shader Layout and Loader Contract

## Directory Layout

All GLSL shader sources live under `src/graphics/shaders/` and are grouped by shader domain:

- `src/graphics/shaders/materials/...`
  - Material vertex/fragment programs for standard 3D materials.
- `src/graphics/shaders/postprocessing/...`
  - Full-screen and postprocess programs used by passes.
- `src/graphics/shaders/chunks/...`
  - Shared reusable shader chunks included through `#include <shaderlib:...>`.
- `src/graphics/shaders/lib/...`
  - Reserved for shared helper libraries and platform-specific constants.

Accepted filename conventions:

- Vertex + fragment pairs use the suffixes:
  - `*.vert.glsl`
  - `*.frag.glsl`
- Shared reusable code uses `*.glsl`.

## Loader Contract

All shader entry points in `src/graphics/shaders/` must be loaded through loader modules that return the shader payload contract below:

- `vertexSource` (`string`)
- `fragmentSource` (`string`)
- `defines` (`Record<string, string>`, optional)
- `uniforms` (`Record<string, Uniform>`)
- `variantKey` (`string`)
- `vertexPath`/`fragmentPath` (`string`, required for debug/reporting)

Loaders should call `createShaderPayload(...)` from `src/graphics/shaders/core/ShaderLoader.js`.

Recommended conventions for new loader modules:

- Keep one loader file per shader domain usage in `src/graphics/shaders/<domain>/<ShaderName>Loader.js`.
- Prefer compile-time `#define` controls over manual string mutations.
- Keep uniform schemas with type/range defaults and let loader boundary validation normalize runtime inputs.
- Attach metadata with `attachShaderMetadata(...)` for compile/debug visibility.

## Migration Policy

- Inline shader strings should not be introduced in `.js`/`.mjs` source files.
- Inline migration is allowed only in tests/mocks intentionally validating loader behavior.
- New shaders must add both source files and loader modules in the same change.
