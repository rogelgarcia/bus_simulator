// Boolean-subtract command module.

import { COMMAND_TYPE } from './commandTypes.js';
import { freezeCommand } from './shared/commandCommon.js';
import { executeBooleanCommand, normalizeBooleanArgs } from './shared/booleanCommandHelpers.js';

const INSTRUCTION_PATTERN = /^boolean\s+subtract\s+([a-zA-Z0-9._:-]+)\s+by\s+([a-zA-Z0-9._:-]+)(?:\s+mode\s+(through|clamped))?$/i;

export const booleanSubtractCommandModule = Object.freeze({
    type: COMMAND_TYPE.BOOLEAN_SUBTRACT,
    mode: 'active',
    isBooleanCommand: true,
    parseInstruction({ compact, commandId, instructionIndex }) {
        const match = compact.match(INSTRUCTION_PATTERN);
        if (!match) return null;
        return freezeCommand({
            commandId,
            type: COMMAND_TYPE.BOOLEAN_SUBTRACT,
            args: {
                targetObjectId: match[1],
                toolObjectId: match[2],
                subtractMode: match[3] && match[3].toLowerCase() === 'clamped' ? 'subtract_clamped' : 'subtract_through',
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
            type: COMMAND_TYPE.BOOLEAN_SUBTRACT,
            args: normalizeBooleanArgs(args, `commands[${rawIndex}].args`, COMMAND_TYPE.BOOLEAN_SUBTRACT, commandId),
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
