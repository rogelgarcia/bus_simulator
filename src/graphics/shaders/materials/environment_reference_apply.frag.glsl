if (referenceEnvironmentEnabled) {
    reflectedLight.indirectSpecular = referenceEnvironment(geometryNormal,geometryViewDir,material.roughness);
}
#include <aomap_fragment>
