# DONE

#Problem

Road Debugger has usability issues at the entry level:
- From the Welcome/Setup flow, pressing the `9` shortcut does not enter Road Debugger as expected.

# Request

Fix Road Debugger entry so it can be accessed reliably via the intended keyboard shortcut and menu selection.

Use the shared Road Debugger UI vocabulary and precedence rules defined in `AI_93_ROADS_road_debugger_ui_information_architecture_reorg`.

Tasks:
- Ensure pressing `9` from both the Welcome screen and Setup screen enters the Road Debugger scene as intended.
- Ensure the Road Debugger scene is consistently discoverable/accessible via the setup/scene selection UI (labels, ordering, shortcut hints).
- Ensure the fix does not regress other numeric shortcuts or scene selection behavior.
- Add a quick verification checklist:
  - Fresh reload → Welcome screen → press `9` → Road Debugger appears.
  - Switching back and forth between scenes does not break the shortcut.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_94_DONE_ROADS_road_debugger_entry_and_scene_access`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Enabled reliable Road Debugger entry via the `9` shortcut from Welcome and Setup, and ensured it appears consistently in scene selection.
