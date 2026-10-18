# The Bradbury block's wear layer (AI 563): a post-pass over the built block that the wear features (AI 564-573)
# plug into. wear_layer.py (next to this package) runs it; the README's "The wear layer" section is the manual.
#
#   paths.py     where everything lives: the block it reads, the worn files it writes, all inside portal_project/
#   classes.py   the material classes (brick, terracotta, stone, glass, metal, ...) a feature's response keys on
#   geometry.py  the facade frames and the mask atlas, the block's ray-casting BVH, and the FeatureContext a feature
#                builds its sources, marks and masks with
#   nodes.py     the shader side: a small node-expression builder, the WEAR_layer group every exterior material runs
#                through, and the insertion of that group into the materials
#   controls.py  the switch (off | on | debug) and the per-feature strengths, as the render scene holds them
#   registry.py  the features, in chain order
#   features/    one module per feature
#
# Rule #1 of the layer (the user's, twice rejected otherwise): no noise, no random scatter. Every mark comes from a
# physical source found on the model and follows a physical path from it; irregularity inside a mark comes from the
# surface's own maps (the brick's joints, the stone's grain) or from the source's shape.
