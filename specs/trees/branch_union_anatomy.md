# Mature branch attachment anatomy

The AI587 authoring revision addresses the abrupt cylinder intersections visible
in the AI586 London plane. Real branch unions differ with branch size, angle,
species and growth history. A branch collar is often more developed below a
lateral branch; the branch bark ridge runs from the upper crotch down its sides.
These are asymmetric growth features, not a uniform ring around a pipe.

[Purdue Extension, branch component identification](https://purduelandscapereport.org/article/branch-component-identification-for-better-pruning-cuts/)
explains the collar swelling through differential growth and intermingling tissues,
and identifies the rough raised bark ridge. Its live-branch photograph and
section illustration are retained for local study with copyright attribution.

[Averilp's labelled branch photograph](https://commons.wikimedia.org/wiki/File:Labelled_tree_parts.jpg)
(CC BY-SA 4.0, unmodified) shows the lower collar extending down the trunk and
the upper ridge terminating in the crotch. It is a reference, not a game texture.

[Slater et al., Trees 28 (2014), DOI 10.1007/s00468-014-1047-5](https://research.monash.edu/en/publications/the-anatomy-and-grain-pattern-in-forks-of-hazel-corylus-avellana-/)
describes interlocking grain at the apex of comparable-diameter forks. That
supports distinguishing a broad scaffold junction from a small lateral attachment;
external collar prominence alone does not establish a fork's mechanical strength.

## Authoring contract

`vegetation/junctions` reads a validated photographic scene, rebuilds its wood,
and saves a new task-specific scene. Collars follow each parent/child intersection,
have an extended lower shoulder and narrower upper ridge, and receive independent
seeded variations of width, offset, shoulder length and angular relief. All added
volumes fuse before photo-based displacement. No disconnected rings are added.
Geometry outside the attachment is retained by the original skeleton, and leaf
geometry/transforms must hash identically before and after. Closed manifold wood,
connected tree stems and the original triangle safety limits remain mandatory.
Displaced-face orientation is evaluated at consistent double precision using
coordinates quantized to the mesh storage precision. A focused zero-displacement
regression protects narrow planar cap triangles against false orientation flips;
the original face rejection threshold is retained.

The camera-only phase hashes all mesh coordinates/transforms and saves a separate
scene. Fork studies use visibly diverging attachments; obstructed study views
hide foliage with explicit labels, while whole-tree views retain the canopy.
Final review evidence includes all three mature forms per species, textured and
clay attachment studies, a same-camera London plane comparison and credited
reference photographs under `tests/artifacts/screens/ai587_branch_unions/final/`.

References live in `downloads/vegetation/ai587/references/`; final evidence lives
under `tests/artifacts/screens/ai587_branch_unions/`. Existing game trees are not
replaced. This models visible anatomical form, not a mechanical growth simulation.
