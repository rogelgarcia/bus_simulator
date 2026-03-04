// src/graphics/gui/mesh_fabrication/command_pipeline/stages/auditLogStage.js

export function runCommandAuditLogStage({ executionResult, buildAuditLog }) {
    if (typeof buildAuditLog !== 'function') {
        throw new Error('[CommandAuditLogStage] buildAuditLog callback is required.');
    }
    return buildAuditLog(executionResult);
}
