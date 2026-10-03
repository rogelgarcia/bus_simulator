// Binds an explicit example edit batch to a fresh authoritative selection context.
// @ts-check

/** @param {any} template @param {any} context @param {{batchId:string}} options */
export function bindLandscapeBatchTemplate(template, context, { batchId }) {
    if (context?.format !== 'landscape-selection' || context.schemaVersion !== 1 || context.provisional !== false
        || context.editingReady !== true || !['circle', 'rectangle'].includes(context.region?.type)) throw new Error('[LandscapeAuthoring] Template binding needs an exact bounded-area selection context');
    if (typeof batchId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,99}$/.test(batchId)) throw new Error('[LandscapeAuthoring] Supply a fresh stable batch ID of at most 100 characters');
    if (template?.format !== 'landscape-edit-batch' || template.schemaVersion !== 1 || template.id !== '$batchId'
        || template.landscapeId !== '$selection.landscapeId' || template.expectedRevision !== '$selection.sourceRevision'
        || !Array.isArray(template.operations) || !template.operations.length) throw new Error('[LandscapeAuthoring] Unsupported batch template structure');
    const batch = structuredClone(template);
    batch.id = batchId; batch.landscapeId = context.landscapeId; batch.expectedRevision = context.sourceRevision;
    for (const operation of batch.operations) {
        if (operation.region !== '$selection.region' || typeof operation.id !== 'string') throw new Error('[LandscapeAuthoring] Template operations must use the selected region');
        operation.id = `${batchId}/${operation.id}`;
        operation.region = structuredClone(context.region);
    }
    return batch;
}
