#Problem (DONE)

We currently have two separate asphalt-related debug tools:

- `Road Markings Calibration` (`debug_tools/road_markings_calibration.html`)
- `Asphalt Debug` (`debug_tools/asphalt_debug.html`, currently launched via a dedicated shortcut)

This splits workflow and makes it harder to debug asphalt + markings together. We want a single asphalt-focused debugger that also includes the road-markings calibration output panel, and we want to remove the standalone road-markings debugger.

# Request

Merge the Road Markings Calibration tool into the Asphalt Debug tool, delete the standalone Road Markings tool, and renumber Asphalt so it is debug tool number `2`.

Tasks:
- Move the Road Markings Calibration “output panel” into the Asphalt Debug tool:
  - Copy the calibration **results/output UI** (measured sRGB readout + sampling action) into the Asphalt debugger’s UI (docked panel).
  - Ensure the sampling logic still works in the Asphalt debugger context (marking meshes present, correct renderer readPixels, deterministic camera pose for sampling).
  - Keep the Asphalt debugger focused: integrate the panel cleanly without clutter (collapsible section is fine).
- Remove the standalone tool:
  - Delete `debug_tools/road_markings_calibration.html`.
  - Remove/update any docs/links referencing it (ex: `debug_tools/README.md`).
- Renumber shortcuts:
  - Update `src/states/DebugToolRegistry.js` so `Asphalt` becomes key `2`.
  - Ensure the Debug tools menu reflects the new numbering and no longer shows Road Markings Calibration.
  - Update any hard-coded hints or keybindings that referenced the old numbering/shortcut.
- Verify navigation behavior:
  - `Esc` in the Asphalt debugger returns to Welcome/index (consistent with other isolated debug tools).
  - Existing “asphalt debugger” entry points still work (update any welcome/setup shortcuts to point to the new numbering/URL).

Nice to have:
- Add a small “Markings Calibration” section inside Asphalt debugger with:
  - Target colors displayed (yellow/white target hex)
  - A “Sample Colors” button and measured readout
  - A note explaining how to position the camera / what is being sampled
- If there are existing links/bookmarks to the old road markings page, add a tiny redirect/stub HTML (optional) that forwards to the Asphalt debugger section (only if we want to avoid breaking old URLs).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_208_TOOLS_merge_road_markings_calibration_into_asphalt_debugger_and_renumber_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Merged the markings calibration sampler + readout into the Asphalt Debugger’s docked UI (Asphalt tab).
- Removed the standalone `road_markings_calibration` debug tool page and registry entry.
- Renumbered Debug Tools so Asphalt is now key `2` (and shifted later tools down).
