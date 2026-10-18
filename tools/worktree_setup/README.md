# Shared Blender folders in worktrees

Run `node tools/worktree_setup/run.mjs` from a checkout to inspect the plan, then add `--apply` to create missing
root junctions for `blender_files` and `blender_inputs` in every registered worktree. Main owns the real folders.
The tool refuses tracked contents, a linked main data folder, or an existing path with a different target. It never
moves, replaces or removes an existing path, and it never cleans up a checkout.

The root `.gitignore` must ignore both stores. While older branches have not received those rules, add the two
root patterns to the shared Git `info/exclude`, backing that file up first under the project's dated backup root
with a manifest. Never put tracked files in either store. The setup tool does not alter ignores automatically.

Only one session may write a given shared file. Branch scripts write into the same stores; use an explicit scratch
`out=` or `BLENDER_FILES_ROOT` for builds that must not change the shared files. Do not archive/remove worktrees.
