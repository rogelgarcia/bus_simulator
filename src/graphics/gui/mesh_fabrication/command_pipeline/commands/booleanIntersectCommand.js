// Boolean-intersect command module.

import { COMMAND_TYPE } from './commandTypes.js';
import { freezeCommand } from './shared/commandCommon.js';
import { executeBooleanCommand, normalizeBooleanArgs } from './shared/booleanCommandHelpers.js';

const INSTRUCTION_PATTERN = /^boolean\s+intersect\s+([a-zA-Z0-9._:-]+)\s+with\s+([a-zA-Z0-9._:-]+)$/i;

export const booleanIntersectCommandModule = Object.freeze({
    type: COMMAND_TYPE.BOOLEAN_INTERSECT,
    mode: 'active',
    isBooleanCommand: true,
    parseInstruction({ compact, commandId, instructionIndex }) {
        const match = compact.match(INSTRUCTION_PATTERN);
        if (!match) return null;
        return freezeCommand({
            commandId,
            type: COMMAND_TYPE.BOOLEAN_INTERSECT,
            args: {
                targetObjectId: match[1],
                toolObjectId: match[2],
                outputPolicy: 'replace_target'
            },
            source: {
                kind: 'instruction',
                index: instructionIndex,
                text: compact
            }
        });
    },
    normalizeRaw({ commandId, rawIndex, args }) {
        return freezeCommand({
            commandId,
            type: COMMAND_TYPE.BOOLEAN_INTERSECT,
            args: normalizeBooleanArgs(args, `commands[${rawIndex}].args`, COMMAND_TYPE.BOOLEAN_INTERSECT, commandId),
            source: {
                kind: 'command',
                index: rawIndex
            }
        });
    },
    execute({ command, operationId, runtime }) {
        return executeBooleanCommand({
            command,
            operationId,
            runtime,
            runtimeContractVersion: runtime.booleanRuntimeContractVersion
        });
    }
});
