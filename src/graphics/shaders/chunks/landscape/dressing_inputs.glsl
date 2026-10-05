// AI577 D5 landscape-dressing-inputs v1 for the terrain dressing diagnostics, mirroring sampleLandscapeDressingInputs (src/app/landscape/
// LandscapeDressingInputs.js). Include through the shaderlib directive for landscape/dressing_inputs. The parameters are compile-time defines of
// landscapeDressingDefines(); host soils are classes (0 none, 1 sand, 2 loam, 3 forest, 4 rock) so any catalog order works. Inputs are the display
// soil weights of each class (normalized), the planning-only share and the decoded fine terrain fields of the fragment.
struct LandscapeDressing {
    float grass;
    float shrub;
    float tree;
    float rock;
    float debris;
};

// classes: x sand, y loam, z forest, w rock weight; fields: wetness, rockExposure, skyView, shoreDistance, slopeDegrees
LandscapeDressing landscapeDressingInputs(vec4 classes, float planningShare, float wetness, float rockExposure, float skyView, float shore, float slope) {
    float natural = 1.0 - planningShare, land = shore > 0.0 ? 1.0 : 0.0;
    float grass = (classes.y * LANDSCAPE_DRESSING_GRASS.x + classes.z * LANDSCAPE_DRESSING_GRASS.y * skyView) * (1.0 - smoothstep(LANDSCAPE_DRESSING_GRASS.z, LANDSCAPE_DRESSING_GRASS.w, slope))
        * (1.0 - LANDSCAPE_DRESSING_GRASS_TERMS.x * rockExposure) * (LANDSCAPE_DRESSING_GRASS_TERMS.y + (1.0 - LANDSCAPE_DRESSING_GRASS_TERMS.y) * wetness)
        * smoothstep(LANDSCAPE_DRESSING_GRASS_TERMS.z, LANDSCAPE_DRESSING_GRASS_TERMS.w, shore);
    float shrub = (classes.y * LANDSCAPE_DRESSING_SHRUB.x + classes.z * LANDSCAPE_DRESSING_SHRUB.y) * (1.0 - smoothstep(LANDSCAPE_DRESSING_SHRUB.z, LANDSCAPE_DRESSING_SHRUB.w, slope))
        * (1.0 - LANDSCAPE_DRESSING_SHRUB_TERMS.x * rockExposure) * (LANDSCAPE_DRESSING_SHRUB_TERMS.y + (1.0 - LANDSCAPE_DRESSING_SHRUB_TERMS.y) * wetness)
        * smoothstep(LANDSCAPE_DRESSING_SHRUB_TERMS.z, LANDSCAPE_DRESSING_SHRUB_TERMS.w, shore);
    float tree = classes.z * LANDSCAPE_DRESSING_TREE.x * (1.0 - smoothstep(LANDSCAPE_DRESSING_TREE.y, LANDSCAPE_DRESSING_TREE.z, slope)) * (1.0 - LANDSCAPE_DRESSING_TREE.w * rockExposure)
        * (1.0 - LANDSCAPE_DRESSING_TREE_TERMS.z * smoothstep(LANDSCAPE_DRESSING_TREE_TERMS.x, LANDSCAPE_DRESSING_TREE_TERMS.y, wetness))
        * smoothstep(LANDSCAPE_DRESSING_TREE_SHORE.x, LANDSCAPE_DRESSING_TREE_SHORE.y, shore);
    float rock = (classes.w * (LANDSCAPE_DRESSING_ROCK.x + LANDSCAPE_DRESSING_ROCK.y * rockExposure) + (classes.y + classes.z) * LANDSCAPE_DRESSING_ROCK.z * rockExposure) * land;
    float debris = classes.x * LANDSCAPE_DRESSING_DEBRIS.x * smoothstep(LANDSCAPE_DRESSING_DEBRIS.y, LANDSCAPE_DRESSING_DEBRIS.z, shore)
        * (1.0 - smoothstep(LANDSCAPE_DRESSING_DEBRIS_TERMS.x, LANDSCAPE_DRESSING_DEBRIS_TERMS.y, shore)) * (1.0 - smoothstep(LANDSCAPE_DRESSING_DEBRIS_TERMS.z, LANDSCAPE_DRESSING_DEBRIS_TERMS.w, slope));
    return LandscapeDressing(clamp(grass * natural, 0.0, 1.0), clamp(shrub * natural, 0.0, 1.0), clamp(tree * natural, 0.0, 1.0), clamp(rock * natural, 0.0, 1.0), clamp(debris * natural, 0.0, 1.0));
}
