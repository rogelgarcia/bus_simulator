# Headless browser integration tests (Playwright)

Specs live under `tests/headless/e2e/` (`*.pwtest.js`) and drive the deterministic harness at `tests/headless/harness/`.

## Setup

1. Install dependencies:
   - `npm i`
2. Install browsers (once per machine/CI image):
   - `npx playwright install --with-deps chromium`

## Run

- Headless (default): `npm run test:headless`
- Headed (debug): `npm run test:headless:headed`

Artifacts (screenshots/videos/traces) are written under `tests/artifacts/headless/e2e/` and are gitignored.
