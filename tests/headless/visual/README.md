# Visual regression (screenshots)

This suite renders deterministic “golden frames” in a headless browser (Playwright) and compares screenshots against committed baselines.

## Layout

- Specs: `tests/headless/visual/specs/`
- Baselines (committed): `tests/headless/visual/baselines/`
- Failure artifacts (gitignored): `tests/artifacts/headless/visual/`

## Running

Prereqs:
- `npm i`
- `npx playwright install --with-deps chromium`

Commands:
- `npm run test:visual`
- Update baselines (explicit): `npm run test:visual:update`

