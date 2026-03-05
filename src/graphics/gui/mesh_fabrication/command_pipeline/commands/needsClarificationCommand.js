// Needs-clarification command module.

import { COMMAND_TYPE } from './commandTypes.js';
import { assertObject, assertString, freezeCommand } from './shared/commandCommon.js';

export function buildNeedsClarificationCommand({
    commandId,
    source,
    args
}) {
    return freezeCommand({
        commandId,
        type: COMMAND_TYPE.NEEDS_CLARIFICATION,
        args: {
            ...(args ?? {})
        },
        source: {
            ...(source ?? {})
        }
    });
}

export const needsClarificationCommandModule = Object.freeze({
    type: COMMAND_TYPE.NEEDS_CLARIFICATION,
    mode: 'active',
    normalizeRaw({ commandId, rawIndex, args }) {
        const payload = assertObject(args ?? {}, `commands[${rawIndex}].args`);
        const normalized = {};
        if (payload.rawText !== undefined) {
            normalized.rawText = assertString(payload.rawText, `commands[${rawIndex}].args.rawText`);
        }
        if (payload.reason !== undefined) {
            normalized.reason = assertString(payload.reason, `commands[${rawIndex}].args.reason`);
        }
        if (payload.rawType !== undefined) {
            normalized.rawType = assertString(payload.rawType, `commands[${rawIndex}].args.rawType`);
        }
        return buildNeedsClarificationCommand({
            commandId,
            source: { kind: 'command', index: rawIndex },
            args: normalized
        });
    },
    execute({ command }) {
        return Object.freeze({
            status: 'needs_clarification',
            message: command?.args?.reason ?? 'unrecognized instruction',
            targetIds: Object.freeze([]),
            outputIds: Object.freeze([]),
            markers: Object.freeze([])
        });
    }
});
