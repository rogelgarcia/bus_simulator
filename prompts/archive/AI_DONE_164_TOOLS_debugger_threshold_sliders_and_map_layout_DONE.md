# DONE

# Problem

In the Road Debugger view there is a tunable setting labeled “threshold x laneWidth” that affects how much the road is reduced/trimmed at crossings. The same setting does not appear to be available in the City Debugger view, making it difficult to get consistent behavior and to tune crossings while working in the city context. Additionally, the City Debugger controls are harder to tune precisely because they are not presented as sliders. The Map Debugger panel is also unnecessarily tall because its toggles and junction controls are stacked in a single column.

# Request

Improve debugger UI consistency and usability across Road/City/Map debugger views, focusing on crossing trimming controls and panel layout.

Tasks:
- Add the “threshold x laneWidth” crossing trimming control to the City Debugger view with the same meaning, behavior, and default value as the Road Debugger view.
- Ensure changes to this control in the City Debugger reliably update how crossings reduce/trim roads (matching the Road Debugger behavior).
- Replace City Debugger numeric/tunable controls with slider-based controls to make tuning faster and less error-prone, while keeping values readable/precise.
- Update the Map Debugger view layout so the toggles are in one column and the junctions section is in a second column, reducing the overall panel height.
- Keep the Map Debugger layout usable on narrow viewports (columns can stack when needed) and preserve existing styling and interactions.

Nice to have:
- Clarify via UI text/tooltip what “threshold x laneWidth” affects (road reduction/trim at crossings) so it’s discoverable without guesswork.
- Reuse shared slider/row UI patterns already used elsewhere so the Debugger UIs remain consistent and avoid adding more boilerplate.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_164_TOOLS_debugger_threshold_sliders_and_map_layout_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added `threshold × laneWidth` crossing trim control in the Map Debugger and plumbed it into city road generation.
- Converted junction tuning inputs in the Map Debugger to range+number slider controls.
- Reworked Map Debugger panel layout into two columns (toggles left, crossings/junctions right) with responsive stacking.
