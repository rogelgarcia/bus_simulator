// Public exports for renderer-independent staged illumination resource loading.
// @ts-check

export {
    createIlluminationResourceLoader,
    ILLUMINATION_RUNTIME_PHASES,
    ILLUMINATION_RUNTIME_STATES
} from './IlluminationResourceLoader.js';
export {
    createIlluminationRuntime,
    markIlluminationPackageFetcherAsTransferOwned
} from './IlluminationRuntime.js';
export { createIlluminationControllerStagingResult } from './IlluminationControllerAdapter.js';
export {
    createRuntimeFailure,
    IlluminationRuntimeError,
    serializeIlluminationRuntimeError
} from './IlluminationRuntimeError.js';
export {
    createIlluminationPackageChunkReader,
    createIlluminationPackageResourcePlan,
    decodeIlluminationPackageResource,
    hashIlluminationPackageResource
} from './IlluminationPackagePlan.js';
export { createResourceDisposalRegistry } from './ResourceDisposal.js';
export {
    assertActualMemoryFits,
    assertEstimatedMemoryFits,
    defaultCapabilityCheck,
    sanitizeLoadOptions,
    sanitizeResourcePlan
} from './ResourcePlan.js';
export { createRuntimeDiagnostics } from './RuntimeDiagnostics.js';
export { createStagedIlluminationResources } from './StagedIlluminationResources.js';
export {
    createWebGl2IlluminationResourceFactory,
    probeWebGl2IlluminationCapabilities,
    validateWebGl2IlluminationResourceDescriptor,
    validateWebGl2IlluminationResourcePlan,
    WEBGL2_ILLUMINATION_CAPABILITY_IDS,
    WEBGL2_ILLUMINATION_EXTENSION_NAMES
} from './WebGl2IlluminationResources.js';
