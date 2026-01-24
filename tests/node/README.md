# Node tests

This repo supports Node-only tests for “pure JS” logic (no DOM/WebGL).

## Running

- `node --test tests/node/**/*.test.js`
- `node --test tests/node/unit/**/*.test.js`
- `node --test tests/node/sim/**/*.test.js`

If you have npm available:

- `npm run test:node`

## Conventions

- Keep Node tests free of browser-only dependencies (`window`, `document`, `three`, WebGL).
- Put shared helpers under `tests/shared/`.
- Write any generated outputs under `tests/artifacts/node/` (the whole `tests/artifacts/` folder is gitignored).
