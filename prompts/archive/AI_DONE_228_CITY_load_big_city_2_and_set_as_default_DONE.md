#Problem (DONE)

There is a new city definition named `big_city_2` in the `downloads/` folder, but gameplay is still using the existing “city 1” default. We want to integrate `big_city_2` into the game and make it the standard/default city used for gameplay, without deleting or breaking the existing city 1 setup.

# Request

Add support for loading the `big_city_2` city definition from `downloads/` (by integrating it into the game’s source/assets), and switch gameplay to use `big_city_2` as the default city. Keep city 1 available and intact; only change the default pointer/selection.

Tasks:
- Integrate `big_city_2`:
  - Locate the `big_city_2` city definition in `downloads/`.
  - Copy it into the appropriate in-repo location for city definitions so runtime does not depend on `downloads/`.
  - Create whatever loader/registration is needed so the game can load `big_city_2` like other city definitions.
- Preserve existing city 1:
  - Do not remove or overwrite the current city 1 definition.
  - Ensure any explicit references to city 1 continue to work.
- Switch gameplay default:
  - Update the gameplay startup/default selection so `big_city_2` is used by default.
  - Keep a clear way to select city 1 (via existing UI/debug selection, config, or catalog entry), even if it is no longer the default.
- Robustness:
  - If `big_city_2` fails to load for any reason, fail gracefully and fall back to city 1 (or a safe default), with a clear console warning rather than a crash.
- Determinism and performance:
  - Ensure `big_city_2` loading is deterministic and doesn’t cause obvious regressions in load time or runtime performance compared to the previous default.

Nice to have:
- Add a small “City” selection control in a debug/setup/options area to quickly switch between city 1 and `big_city_2` for A/B comparisons.
- Add a short doc note describing where city definitions live and how to add new ones from `downloads/`.

## Quick verification
- Start gameplay from a clean load:
  - The city loaded by default is `big_city_2`.
- Switch/force city 1:
  - City 1 still loads correctly.
- Simulate a missing/invalid `big_city_2` asset:
  - Game falls back cleanly without crashing.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_228_CITY_load_big_city_2_and_set_as_default_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Integrated `downloads/big_city2.json` into runtime source as `src/app/city/specs/BigCity2Spec.js`.
- Registered `bigcity2` in `src/app/city/specs/CitySpecRegistry.js` for tool/debug selection.
- Switched gameplay default city to Big City 2 with URL override (`?city=bigcity`) and a safe fallback to city 1 on load failure.
- Documented the “copy from downloads into JS specs” rule in `src/app/city/specs/README.md`.
