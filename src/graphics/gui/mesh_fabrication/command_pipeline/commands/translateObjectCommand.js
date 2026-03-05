// Translate-object command module.

import { COMMAND_TYPE } from './commandTypes.js';
import {
    assertString,
    freezeCommand,
    normalizeVec3
} from './shared/commandCommon.js';
import { ensureOverride } from './shared/runtimeObjectState.js';

const INSTRUCTION_PATTERN = /^translate\s+object\s+([a-zA-Z0-9._:-]+)\s+by\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/i;

export const translateObjectCommandModule = Object.freeze({
    type: COMMAND_TYPE.TRANSLATE_OBJECT,
    mode: 'active',
    parseInstruction({ compact, commandId, instructionIndex }) {
        const match = compact.match(INSTRUCTION_PATTERN);
        if (!match) return null;
        return freezeCommand({
            commandId,
            type: COMMAND_TYPE.TRANSLATE_OBJECT,
            args: {
                objectId: match[1],
                delta: [Number(match[2]), Number(match[3]), Number(match[4])]
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
            type: COMMAND_TYPE.TRANSLATE_OBJECT,
            args: {
                objectId: assertString(args.objectId, `commands[${rawIndex}].args.objectId`),
                delta: normalizeVec3(args.delta, `commands[${rawIndex}].args.delta`)
            },
            source: {
                kind: 'command',
                index: rawIndex
            }
        });
    },
    execute({ command, runtime }) {
        const objectId = assertString(command.args.objectId, `${command.commandId}.args.objectId`);
        const delta = normalizeVec3(command.args.delta, `${command.commandId}.args.delta`);
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

        const override = ensureOverride(runtime.overridesMutable, objectId);
        const base = override.position ?? object.position;
        override.position = [
            base[0] + delta[0],
            base[1] + delta[1],
            base[2] + delta[2]
        ];

        return Object.freeze({
            status: 'applied',
            message: '',
            targetIds: Object.freeze([objectId]),
            outputIds: Object.freeze([objectId]),
            markers: Object.freeze([])
        });
    }
});
