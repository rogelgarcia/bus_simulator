#DONE #Problem

Multiple UI screens are starting to rely on icon-only buttons (tabs, toggles, toolbars). The project currently lacks a shared, consistent icon system, which leads to inconsistent styling and duplicated icon assets/implementations across screens.

# Request

Adopt Google **Material Symbols Outlined** as the shared icon system for the UI, loaded via CDN, and introduce a small reusable icon component/helper so screens can render icons consistently.

Tasks:
- Add Material Symbols Outlined via CDN:
  - Update `index.html` to load the Material Symbols Outlined font from Google Fonts CDN.
  - Ensure the font is available to all UI screens and does not break existing CSS.
- Add a shared icon utility/component:
  - Create a reusable way to render icons (e.g., a CSS class + small helper function) that:
    - Uses Material Symbols Outlined.
    - Supports size variants (small/medium/large).
    - Supports active/disabled states consistent with existing UI styling.
    - Works inside buttons and tab headers.
  - Ensure icons are accessible:
    - Icon-only buttons must have tooltips and/or `aria-label` text.
- Migrate at least one existing UI area to demonstrate the pattern:
- Add documentation:
  - Add a short section to PROJECT_RULES.md that Material Symbols glyph must be used in the UI for all icons.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_107_DONE_MATERIAL_add_material_symbols_outlined_icons_via_cdn`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Added Material Symbols Outlined via CDN, introduced shared icon helpers/CSS, and migrated inspector navigation buttons to icon-only with accessibility labels.
