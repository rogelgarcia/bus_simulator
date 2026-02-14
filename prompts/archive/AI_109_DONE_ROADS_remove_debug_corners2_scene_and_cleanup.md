#DONE #Problem

The project still contains the “Debug corners 2” scene and related code, but it is no longer part of the intended toolset. Keeping it around adds maintenance overhead and creates confusion (menu entries, CSS, state wiring, tests, and dead code paths).

# Request

Remove all code related to the “Debug corners 2” scene from the repository, while preserving any shared/reused components that other scenes depend on. Also remove tests that target this scene and clean up any orphaned files/references left behind.

Tasks:
- Identify all “Debug corners 2” ownership scope:
  - State module(s) and state registration (Setup/Welcome scene selection and state machine registration).
  - GUI scene/view/UI code under `src/graphics/gui/debug_corners2/`.
  - Any visuals/helpers that are exclusive to this scene.
  - Any CSS referenced by `index.html` or other stylesheets.
  - Any tests/config files that exist solely for this scene.
- Remove the scene end-to-end:
  - Delete the Debug corners 2 state and stop registering it in the state machine.
  - Delete the Debug corners 2 GUI code and CSS.
  - Remove any setup/welcome menu entries or shortcuts that referenced it.
- Preserve shared code:
  - If a module originally created for Debug corners 2 is reused elsewhere, keep it and/or relocate it to the appropriate shared folder.
  - If keeping shared helpers, ensure their naming and placement reflect that they are no longer “debug_corners2” specific.
- Cleanup and orphan checks:
  - Remove all imports/references to Debug corners 2 (including in `index.html` CSS links).
  - Remove tests that target Debug corners 2.
  - Recheck for orphaned files, unused exports, and dead code paths introduced by the removal.
  - Ensure the remaining scenes still build and run (no missing imports).
- Verification:
  - Confirm the app loads without console errors.
  - Confirm Setup/Welcome menus do not reference Debug corners 2.
  - Confirm the browser-run tests still pass (or at minimum, Debug corners 2 tests are removed and nothing else breaks).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_109_DONE_ROADS_remove_debug_corners2_scene_and_cleanup`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Removed Debug Corners 2 end-to-end (state registration, UI/scene code, CSS link, and dedicated tests) and cleaned all remaining references.
