#DONE
#Problem

The repository has “redirect” JavaScript modules that only re-export symbols from another file (re-export shims). These are useful during refactors, but they can accumulate and become hard to track. We need a lightweight tool that detects these redirect files so we can audit and clean them up over time.

Additionally, tooling in `tools/` is not centrally documented and can be hard to discover. We need a single registry document for repo tooling and a project rule to keep it maintained.

# Request

Create a repo tool that identifies `.js` files that are “redirect re-export shims” (files that only re-export from another module), and introduce a tooling registry (`PROJECT_TOOLS.md`) plus a project rule requiring new tools to be documented there.

Tasks:
- Create a new tool under `tools/`:
  - Create a subfolder for the tool (one tool per folder).
  - Add a `README.md` in that folder describing:
    - the purpose of the tool,
    - how to run it,
    - inputs/outputs,
    - example usage.
- Implement the redirect re-export detector:
  - Scan the repo for JavaScript modules (start with `src/**/*.js`, optionally allow additional roots via CLI args).
  - Identify files that contain only “re-export” statements (e.g., `export * from './x.js'` and/or `export { a, b } from './x.js'`) plus optional blank lines.
  - Ignore comment lines when classifying (both `//` and block comments `/* ... */`).
  - Do not classify aggregator modules with real logic as redirect shims (the tool should be conservative).
  - Output a report listing:
    - file path,
    - the re-export targets referenced,
    - a short classification reason.
  - Support output formats:
    - human-readable (default),
    - `--json` for machine-readable output.
- Create `PROJECT_TOOLS.md` at the repo root:
  - List all tools under `tools/` (including this new tool).
  - For each tool, include: name, folder path, one-line purpose, and the command to run it.
- Update `PROJECT_RULES.md`:
  - Add a rule: every new tool added under `tools/` must live in its own subfolder and must include a `README.md`.
  - Add a rule: every tool must be registered in `PROJECT_TOOLS.md`.
  - Keep wording short and consistent with existing rules style.
- Verification:
  - Run the new tool and confirm it correctly detects known redirect files (example patterns already exist in the repo).
  - Ensure the tool does not flag normal modules that contain logic.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_111_DONE_MESHES_tooling_redirect_export_detector_and_project_tools_registry`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Added `tools/redirect_export_detector/` CLI + created `PROJECT_TOOLS.md` registry and enforced tooling rules in `PROJECT_RULES.md`.
