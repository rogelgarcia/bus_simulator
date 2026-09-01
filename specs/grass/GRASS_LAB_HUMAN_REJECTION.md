# Grass Lab human visual rejection

## Decision

**Status: REJECTED by human visual validation on 2026-08-31.**

After reviewing the final AI 537 renders, the user rejected the complete
offline-first grass solution implemented by AI 350 through AI 362 and AI 537.
The automated structural, deterministic, performance, and pixel-comparison
checks did not establish acceptable visual quality. Their passing results are
historical engineering evidence only.

This decision supersedes every earlier gameplay-authorization or approval
claim in the grass prompts, sequence documents, specifications, and generated
approval records. In particular:

- GRASS_LAB_APPROVAL_AI357.json remains rejected historical V1 evidence;
- GRASS_LAB_APPROVAL_AI362.json is retained as immutable machine-validation
  history but is human-rejected and cannot authorize gameplay;
- the uncommitted AI 537 performance approval record was removed because its
  source visual solution is rejected;
- AI 363 was deleted without implementation; and
- no current prompt may import this grass solution into gameplay.

## Affected prompts

The rejection applies to AI 350, 351, 352, 353, 354, 355, 356, 357, 358, 359,
360, 361, 362, and 537. Their DONE markers record completed engineering work,
not human acceptance.

## Historical material that may be consulted

Future work may study the offline Lab isolation, deterministic capture
instrumentation, exact polygon coverage/exclusion queries, diagnostic
accounting, and timer-query tooling. These are references, not requirements.
Do not reuse the rejected material appearance, baked atlases, density,
near/billboard/middle hierarchy, LOD thresholds, transition design, screenshots,
or approval conclusions as an accepted baseline.

## Restart rule

Grass visual work must restart under a new prompt and new visual direction.
It must not treat any AI 350–362 or AI 537 visual choice as approved. Human
review must explicitly accept representative renders before performance
optimization or gameplay integration can begin.
