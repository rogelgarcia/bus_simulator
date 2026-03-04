// src/graphics/gui/mesh_fabrication/operations/boolean/stages/kernelInvocationStage.js

export function runBooleanKernelInvocationStage({
    invocation,
    invokeKernel
}) {
    if (typeof invokeKernel !== 'function') {
        throw new Error('[BooleanKernelInvocationStage] invokeKernel callback is required.');
    }
    return invokeKernel(invocation);
}
