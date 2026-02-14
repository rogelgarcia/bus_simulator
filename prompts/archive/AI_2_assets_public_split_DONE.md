#Problem [DONE]

Some assets are licensed and should not be shared in the repository. The
current assets folder mixes public and licensed files, which risks accidental
sharing of licensed content.

# Request

Reorganize assets so public files can be shared while licensed assets remain
private and excluded from the repository.

Tasks:
- Create a public subfolder under assets to hold shareable assets.
- Update .gitignore so assets/public is allowed while other assets remain
  ignored.
- Move grass and main.png into assets/public.
- Update any source references to point at the new public asset paths.
- Ensure documentation or usage notes reflect the new public/private split if
  needed.
- Confirm the app still loads the moved public assets as before.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Split `assets/` into public vs private, moved `grass.png` and `main.png` into `assets/public/`, updated references and docs.
