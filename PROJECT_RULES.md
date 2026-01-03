# Project Rules

## Directory Structure

** Local Rules **
- MUST READ PROJECT_RULES.local.md

**Graphics Organization:**
- All graphics-related code → `/src/graphics`
  - 3D assets (models, geometries, generators, Three.js code) → `/src/graphics/assets3d/`
  - GUI/Visual (CSS, widgets, HUD, UI components) → `/src/graphics/gui/`

**App Organization:**
- Application logic → `/src/app` (city, core, geometry, input, physics, skeletons, utils, vehicle)
- Gameplay states → `/src/states`

**Physics:**
- This project uses the Rapier physics library
- Documentation can be found in `/docs/`

**Principle:** Keep rendering/visual code in `/src/graphics` and app logic in `/src/app`

## Code Style

**Logic:**
- Don't create fallback logics with IF statements as a hacky way to solve a problem. Adjust formulas so the problem is solved in a more elegant way.

**Comments:**
- No comments in code files (see exceptions bellow)
- Exception: Second line must be a comment with the file description (e.g., `// Generates roads from city data`)
- Exception: Design decisions (do not explain the code, but why it is written a certain way)
  - Always write design decisions as a high level comment on top of the file (try to be concise)
- Exception: Library source code (preserve all original comments)
- Exception: Hackish solutions (explain what you did and why it's necessary)
- Exception: Extremely high level logic blocks inside functions (e.g. `// render curbs`, `// compute asphalt`)

## AI Guidance

**Commits:**
- Only commit when explicitly asked by the user
- Never commit automatically after making changes
- Never commit AI prompt files named `AI_#_title`


**Tasks:**
These are the ones from files AI_#_title
- Even if explicitly requested, never start DONE prompts without double confirming with the user.
- Before starting any AI prompt, if there are modifications/additions to be commited, confirm if can proceed.
  - if the repo is clean, you can proceed

**3P libraries, assets, models**
If using resources from downloads/ folder, always copy to the application.
- if 3d meshes, put in assets
- if libraries, copy the source to src/lib 
- always organize subfolders accordingly
