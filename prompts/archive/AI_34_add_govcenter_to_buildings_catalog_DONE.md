# Problem [DONE]

`src/app/city/buildings/GovCenter.js` defines a building configuration, but it
is not registered in the buildings catalog, so it cannot be referenced by
`configId` from city specs or selected consistently in tooling.

# Request

Incorporate GovCenter into the city buildings catalog so it can be resolved via
`getBuildingConfigById()` and used by city specs.

Tasks:
- Add `GOV_CENTER_BUILDING_CONFIG` to `src/app/city/buildings/index.js` so it is
  included in the exported building configs list.
- Ensure the config has a stable, consistent `id` and a human-readable `name`
  consistent with the other catalog entries.
- Update/add browser-run tests validating:
  - `getBuildingConfigById('gov_center')` returns the GovCenter config.
  - The catalog list includes the GovCenter config.
- If there are any existing city specs or sample configs that should reference
  GovCenter, update them to use the catalog id.

Constraints:
- Keep changes minimal and focused on catalog integration.
- Follow the comment policy in `PROJECT_RULES.md`.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Registered GovCenter in the building catalog with a human-readable name and added browser tests verifying it resolves via `getBuildingConfigById()` and appears in the catalog list.
