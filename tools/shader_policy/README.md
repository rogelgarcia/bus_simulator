# Shader Policy

Local enforcement for shader source layout and inline-shader policy.

This tool performs a repository-local scan for inline GLSL blocks in `.js`/`.mjs` files that look like shader source assignments.
It is intentionally lightweight and intended for local use during development and CI-equivalent checks.

## Run

```bash
node tools/shader_policy/run.mjs [roots...]
```

- `roots` defaults to `src` when omitted.
- Use `--json` for machine-readable output.

Exit codes:

- `0` = No inline shader source strings found
- `1` = One or more violations found
