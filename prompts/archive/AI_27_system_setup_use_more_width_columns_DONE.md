#Problem [DONE]

The system setup screen (opened after pressing `Q`) does not use enough of the
available screen width, and the button layout is harder to scan due to the
current left-right alternating order.

# Request

Improve the system setup screen layout to use more horizontal space and to
render setup buttons in clear vertical columns.

Tasks:
- Make the system setup UI use more of the screen width while preserving
  existing styling and readability.
- Render the setup buttons in columns rather than alternating left/right.
- Place buttons in column-major order: first column shows items `1, 2, 3, 4,
  ...`, and the second column continues with the remaining items.
- Keep button ordering stable and predictable when the list changes.
- Preserve existing keyboard/mouse interactions and button behavior.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Widened the Setup screen and rendered options in two vertical columns with column-major ordering while preserving navigation and button behavior.
