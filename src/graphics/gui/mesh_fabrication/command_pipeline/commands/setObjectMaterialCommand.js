// Set-object-material command module.

import { COMMAND_TYPE } from './commandTypes.js';
import {
    assertString,
    freezeCommand
} from './shared/commandCommon.js';
import { ensureOverride } from './shared/runtimeObjectState.js';

const INSTRUCTION_PATTERN = /^set\s+material\s+([a-zA-Z0-9._:-]+)\s+to\s+([a-zA-Z0-9._:-]+)$/i;

export const setObjectMaterialCommandModule = Object.freeze({
    type: COMMAND_TYPE.SET_OBJECT_MATERIAL,
    mode: 'active',
    parseInstruction({ compact, commandId, instructionIndex }) {
        const match = compact.match(INSTRUCTION_PATTERN);
        if (!match) return null;
        return freezeCommand({
            commandId,
            type: COMMAND_TYPE.SET_OBJECT_MATERIAL,
            args: {
                objectId: match[1],
                materialId: match[2]
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
            type: COMMAND_TYPE.SET_OBJECT_MATERIAL,
            args: {
                objectId: assertString(args.objectId, `commands[${rawIndex}].args.objectId`),
                materialId: assertString(args.materialId, `commands[${rawIndex}].args.materialId`)
            },
            source: {
                kind: 'command',
                index: rawIndex
            }
        });
    },
    execute({ command, runtime }) {
        const objectId = assertString(command.args.objectId, `${command.commandId}.args.objectId`);
        const materialId = assertString(command.args.materialId, `${command.commandId}.args.materialId`);
        const object = runtime.mutableObjects.get(objectId);
        if (!object) {
            return Object.freeze({
                status: 'rejected',
                message: `Unknown object "${objectId}".`,
                targetIds: Object.freeze([objectId]),
                outputIds: Object.freeze([]),
                markers: Object.freeze([])
            });
        }
        if (!runtime.materialsById.has(materialId)) {
            return Object.freeze({
                status: 'rejected',
                message: `Unknown material "${materialId}".`,
                targetIds: Object.freeze([objectId]),
                outputIds: Object.freeze([]),
                markers: Object.freeze([])
            });
        }

        const override = ensureOverride(runtime.overridesMutable, objectId);
        override.materialId = materialId;

        return Object.freeze({
            status: 'applied',
            message: '',
            targetIds: Object.freeze([objectId]),
            outputIds: Object.freeze([objectId]),
            markers: Object.freeze([])
        });
    }
});
