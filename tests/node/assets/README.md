# Asset and pipeline validation (Node)

This suite runs fast offline checks for common asset regressions (broken GLB headers, missing referenced textures, oversized images, etc).

## Layout

- Checks: `tests/node/assets/checks/`
- Fixtures (optional): `tests/node/assets/fixtures/`
- Reports/artifacts (gitignored): `tests/artifacts/node/assets/`

## Running

- `npm run test:assets`
- `node --test tests/node/assets/**/*.test.js`

