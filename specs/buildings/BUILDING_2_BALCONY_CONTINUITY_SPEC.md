# Building Fabrication 2 — Balcony Continuity Specification

Status: **Implemented (AI 537)**
Scope: **Optional continuity between compatible balcony bay endpoints**

This specification defines one explicit, default-off relationship for joining
balcony platforms and guards. It does not merge facade bays, openings, walls,
or structural piers, and it does not introduce spline/custom-face builders.

## 1. Authored schema

Continuity belongs to the floor layer that owns the participating balconies:

```js
{
    balconyContinuity: {
        links: [
            {
                id: 'front_to_right',
                endpoints: [
                    { faceId: 'A', bayId: 'front_right', edge: 'start' },
                    { faceId: 'B', bayId: 'side_front', edge: 'end' }
                ]
            }
        ]
    }
}
```

- An absent block or an empty `links` array normalizes to absence. Existing
  buildings therefore remain default-off and retain legacy balcony geometry.
- A link has one stable, non-empty `id` and exactly two endpoints.
- An endpoint is `{ faceId, bayId, edge }`:
  - `faceId` is the target **physical** facade run id (`A..Z`);
  - `bayId` is the physical authored slot's stable id, represented at runtime
    by `strip.sourceBayId`; it is not an array index, label, or root bay-master
    id;
  - `edge` is `start` or `end` in that physical face's resolved local-u.
- Link order is not semantic. An endpoint may belong to at most one link. A
  duplicate link id or competing endpoint claim invalidates every participant,
  never whichever record happens to occur later. A malformed link never
  reserves its otherwise valid endpoints, so it cannot suppress unrelated
  valid geometry.
- No corner-post policy is authored in this stage. When posts are enabled, the
  generator deterministically emits one post at a non-collinear joined corner
  and none at a collinear internal seam.

## 2. Face linking, reversal, and topology edits

Endpoint identity is evaluated after facade master/slave assignment. A linked
face may reuse a master's bay configuration, but the endpoint keeps the target
physical `faceId` and that physical slot's `sourceBayId`. Face-link reversal is
already reflected in the solved strip order and MUST NOT be XOR-applied again
by balcony generation.

Silhouette/topology remapping treats one continuity link as one atomic target.
Each affected endpoint face remaps independently through one decision such as
`{ action: 'remap', runIdsBySource: { A: 'E', B: 'F' } }`; the legacy
`{ action: 'remap', runId: 'E' }` form remains valid for ordinary one-target
consumers. If a run mapping reverses local-u, only that endpoint swaps `start`
and `end`.

Destination validation runs after facade and face-link moves materialize. Both
physical faces must then resolve to exactly one authored bay id whose effective
bay has an enabled balcony, and the resulting config must still have exclusive
link ids/endpoints. If either endpoint cannot be resolved or a remap conflicts
with another link, the remapped link is removed/orphaned for review while the
pre-existing link remains untouched; a half-link is never materialized.
Changing face-link reversal after authoring may invalidate a link and requires
an explicit relink instead of a guessed retarget.

## 3. Supported compatibility

A link is generatable only when all of the following hold:

- both endpoints resolve uniquely on the same floor layer to enabled,
  projecting, bay-width balcony spans;
- both spans select the same resolved floor numbers;
- normalized platform depth, thickness, side margin, elevation, and material
  match;
- normalized support and complete railing/infill signatures match;
- each member has an outer/front guard;
- same-run endpoints are touching `end`/`start` edges on the same straight run
  and use the same facade depth; or
- cross-run endpoints reach the shared boundary of consecutive physical
  planar runs and the turn is convex or collinear;
- an existing planar corner facet/micro-bevel may bridge the consecutive runs;
- a multi-link component is one non-branching open chain.

Ordinary 90-degree corners, explicit chamfer runs, edge-bevel corner facets,
and narrower-front-face planar/chamfered arrangements are supported. Facade
bay composition stays independent, so internal pier bays never become part of
the balcony component.

## 4. Unsupported topology

This stage rejects, with an actionable diagnostic:

- curved/spline facade runs;
- recessed balcony continuity;
- opening-width or repeated/multi-span balcony endpoints;
- missing/duplicate ids, ambiguous source-bay matches, duplicate endpoint
  ownership, non-adjacent bays/runs, concave or re-entrant turns;
- incompatible floor selection, placement, platform, support, material, or
  railing configuration;
- branching or closed continuity components;
- degenerate or self-intersecting joined outlines.

An invalid link claims no geometry. Its members fall through to the unchanged
legacy per-bay balcony path, and unrelated valid links still generate.

## 5. Geometry contract

For every valid component and selected floor:

- resolve the back and front platform boundaries in world XZ;
- reuse the canonical planar corner-depth join for both boundaries, including
  any existing corner facet;
- coalesce collinear same-run segments;
- validate a nonzero, simple outline and extrude one platform mesh downward
  from the authored walking-surface elevation;
- never retain overlapping member slabs or add a bridge over them;
- build one continuous outer guard path, suppress internal side guards/end
  caps/posts, and preserve required guards at the two free component ends;
- continue top rails and infill through the turn without coplanar overlap or
  duplicate corner hardware;
- retain per-member balcony supports while de-duplicating world-space guard
  posts;
- annotate emitted meshes with continuity link, bay, face, and floor metadata
  for inspection and tests.

The result must have no triangular platform gap, doubled underside, z-fighting,
or self-intersecting fascia at a supported join.

## 6. BF2 editor contract

The selected enabled balcony bay exposes separate Start and End continuity
rows. Each row shows whether the endpoint is free, valid, invalid, same-run, or
cross-run. Opening a row shows:

- the physical source face/bay/edge;
- its immediate compatible endpoint or linked counterpart;
- face-master provenance and reversed-order status when applicable;
- contextual compatibility diagnostics;
- Create link or Remove link as appropriate.

When the selected physical face is a face-linked slave, its inherited facade
and bay editor remains collapsed and non-editable, but BF2 shows a dedicated
physical-continuity panel. That panel uses the slave face id, resolved bay order,
and reversal provenance so links owned by the physical instance can be inspected,
created, or removed without duplicating master facade data.

Disabled or invalid candidates remain visible with the reason they cannot be
linked. When a silhouette edit affects both endpoint faces, the topology-remap
review shows one `New face for <source>` selector per affected face and stores
the choices in `runIdsBySource`; ordinary single-face targets retain the single
`New face` selector. Creating/removing a link updates the model and 3D preview
immediately. Closing/reopening BF2, catalog loading, normalization, cloning,
export/import, and supported silhouette remapping preserve the canonical link
data.

## 7. Terra & Mar acceptance

`terramar` uses three links on `floor_b8_residential`:

- A right balcony `start` to B A-adjacent balcony `end`;
- A left balcony `end` to H A-adjacent balcony `start`;
- E outer balcony `end` to D E-adjacent balcony `start`, retaining D's
  face-linked source bay id `b8_residential_front_balcony_right`.

The front remains three balcony bays separated by two internal piers away from
the corners. B and H each retain an outer balcony, a centered pier, and an
A-adjacent balcony. Only these three compatible corner pairs join; the center
and all other balconies remain independent.

## 8. Verification

Coverage includes normalization/default-off behavior, endpoint identity,
duplicate ownership, atomic topology remap and reversal, clone/export round
trips, same-run and cross-run components, 90-degree and chamfer/facet corners,
a narrower-front-face variant, invalid/curved fallbacks, joined outline
validity, guard/post de-duplication, BF2 create/remove UI flow, and matched UHD
before/after Terra & Mar captures.
