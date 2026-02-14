# Problem [DONE]

`src/app/city/buildings/Building3.js` defines a building config but it is not
integrated into the city building catalog, and its ids/naming are placeholder
(`building_3`, `Building3.js`). Do the same for building4.

# Request

Integrate the Building3 and 4 configuration into the city building catalog and
rename it to follow the project's naming/id conventions.

Tasks:
- Rename `Building3.js` to a descriptive building config module filename.
- Update the exported config constant name to match existing conventions in
  `src/app/city/buildings/` (clear, specific, and stable).
- Update the building config `id` and `name` fields to be stable and human
  readable, consistent with other catalog entries.
- Integrate the building config into `src/app/city/buildings/index.js` so it
  can be resolved via `getBuildingConfigById()` and appears in the catalog.
- Ensure any existing references (city specs, tests, or UI) that used the old
  id/file path are updated to the new id/file name.
- Add/update browser-run tests validating the new config can be loaded from
  the catalog and that the old placeholder id is not relied on.

Constraints:
- Keep application/city logic in `src/app/`.
- Follow the comment policy in `PROJECT_RULES.md`.
- Keep changes minimal and focused on catalog integration + renaming.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Renamed Building3/4 configs to descriptive modules/ids, integrated them into the building catalog, and added browser tests covering the new entries and absence of placeholder ids.
