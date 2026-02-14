#Problem [DONE]

There is no dedicated way to inspect textures in isolation. As more procedural
and generated textures are added (e.g., building window textures), it becomes
hard to validate tiling, color balance, and appearance without seeing them on a
simple reference surface.

# Request

Add a texture inspector scene modeled after the mesh inspector, with a catalog
UI to browse textures and preview them on a simple surface.

Tasks:
- Create a new "texture inspector" scene following the same concept and UX
  patterns as the mesh inspector.
- Introduce a texture catalog with stable ids and names, and a right-side menu
  showing the current texture id and name.
- Add the building window texture to the texture catalog so it can be checked.
- Provide a preview mode that renders the selected texture on a flat surface
  (e.g., a plane) for inspection.
- Add an option to choose the base color of the flat surface from a small set
  of basic colors.
- Keep the scene visually suitable for texture inspection (reasonable
  background/lighting).
- Ensure selection/cycling between textures works from the catalog UI.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added a texture inspector state/view/UI with a stable texture catalog (including building window textures) and a plane preview with selectable base colors.
