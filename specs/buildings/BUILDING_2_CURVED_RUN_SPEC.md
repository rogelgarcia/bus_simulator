# Building Fabrication 2 — Curved Run and Local Boundary Path Specification

Status: **Implemented for circular runs and AI 541 local bay-boundary transitions**

This document defines the shared path contract consumed by BF2 geometry. It
does not authorize arbitrary whole-face splines; that remains future work.

## 1. Shared sampled-path contract

A path sample has deterministic world-XZ position, unit tangent, outward unit
normal, cumulative arc length, normalized parameter, and ownership metadata.
Sampling is adaptive to a bounded chord error and is stable for the same input.
Tessellation samples never create semantic faces, bays, openings, or repeats.

Straight runs, circular footprint runs, and AI 541 local boundary transitions
provide this same contract. Registered consumers must either use that path or
reject an incompatible authoring request with a diagnostic. Chord, midpoint,
or silent sharp fallbacks are forbidden.

## 2. AI 541 local transition

For a rounded connection, the source paths are trimmed at stations P0 and P1.
A tangent-continuous cubic path connects them. Its endpoint derivatives align
with the incoming/outgoing source tangents. The meeting value J biases handle
allocation and is emitted as an exact deterministic seam sample; moving J
changes the curve without changing P0/P1 tangency.

Runouts are measured in meters along each resolved source path, including
circular arc length. Centered mode links the runouts and uses meeting 0.5.
Authored mode permits independent positive runouts and meeting in (0, 1).

## 3. Consumers

The exterior/interior wall shells, slabs, roof and parapet loops, belts,
cornices, bay wall material regions, meter-space UV accumulation, normals,
openings, decorators, highlights, and explicitly linked balcony continuity
consume the same resolved transition samples. Material ownership changes once
at J and preserves the two source bay/material identities.

## 4. Conflicts and limits

- A rounded connection reserves both runout spans from ordinary bay content.
- Edge bevels and sharp corner cuts yield where AI 541 owns the corner.
- Overlapping transitions or duplicate endpoint ownership are blocked.
- Openings, balcony endpoints, and frontage clearance are validated after
  fill resolution; unsafe joins remain sharp and emit an actionable warning.
- Collapsed spans, invalid frames, cusps, reversed/degenerate tangents, invalid
  loop output, and impossible offsets are blocked rather than approximated.
- A rounded wall boundary does not itself join balconies. AI 537 remains an
  independent explicit relationship.

## 5. Forward compatibility

A future custom face spline may participate by supplying the same station
sampler and endpoint frames. AI 541 identities and authored meters must remain
unchanged; no builder may special-case a future path into different semantics.
