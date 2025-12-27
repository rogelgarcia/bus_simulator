# Project Rules

## Directory Structure

**Graphics Organization:**
- All graphics-related code → `/graphics`
  - 3D assets (models, geometries, generators, Three.js code) → `/graphics/assets3d/`
  - GUI/Visual (CSS, widgets, HUD, UI components) → `/graphics/gui/`

**Principle:** Keep rendering/visual code separate from business logic in `/src`

## Code Style

**Comments:**
- No comments in code files
- Exception: First line must be a comment with the file path (e.g., `// graphics/assets3d/generators/RoadGenerator.js`)
- Exception: Design decisions (do not explain the code, but why it is written a certain way)

