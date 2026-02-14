DONE

#Problem

In the in-game Options panel (key `0` during gameplay), numeric controls are currently laid out as:

- Label on the left
- Slider on the right
- Number input wraps onto the next line

This wastes vertical space and makes quick tuning slower.

# Request

Adjust the Options panel layout so the slider and number input render on the same row whenever there is enough horizontal space, by reducing the slider width and letting normal flow handle wrapping (do not hard-force a single-line layout).

Tasks:
- Update the Options UI styles/layout so range slider + number input are typically on the same row.
  - Reduce the slider width so the number input can fit beside it.
  - Do not force a single line; if the panel is narrow, allow the number input to wrap naturally.
- Keep the label-on-left layout intact.
- Ensure keyboard accessibility remains good (tab order, focus rings).
- Verify in multiple panel widths (desktop wide, narrow window) that wrapping behavior remains acceptable.

Nice to have:
- Slightly tighten row vertical padding to improve scanability without feeling cramped.
- Ensure numeric input widths are consistent across controls so the right side aligns neatly.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_205_REFACTOR_options_panel_slider_and_number_same_row_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (done)
- Updated Options panel CSS so range sliders and numeric inputs sit on the same row when space allows, while still wrapping naturally on narrow widths.
- Standardized numeric input width and improved focus-visible outlines for keyboard tuning.
- Slightly tightened Options section spacing for better scanability.
