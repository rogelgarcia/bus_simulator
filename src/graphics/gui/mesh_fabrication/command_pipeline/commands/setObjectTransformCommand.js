// Set-object-transform command module.

import { COMMAND_TYPE } from './commandTypes.js';
import {
    assertString,
    freezeCommand,
    normalizeVec3
} from './shared/commandCommon.js';
import { ensureOverride } from './shared/runtimeObjectState.js';

const SET_POSITION_PATTERN = /^set\s+position\s+([a-zA-Z0-9._:-]+)\s+to\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/i;
const SET_ROTATION_PATTERN = /^set\s+rotation\s+([a-zA-Z0-9._:-]+)\s+to\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/i;
const SET_SCALE_PATTERN = /^set\s+scale\s+([a-zA-Z0-9._:-]+)\s+to\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/i;

export const setObjectTransformCommandModule = Object.freeze({
    type: COMMAND_TYPE.SET_OBJECT_TRANSFORM,
    mode: 'active',
    parseInstruction({ compact, commandId, instructionIndex }) {
        let match = compact.match(SET_POSITION_PATTERN);
        if (match) {
            return freezeCommand({
                commandId,
                type: COMMAND_TYPE.SET_OBJECT_TRANSFORM,
                args: {
                    objectId: match[1],
                    position: [Number(match[2]), Number(match[3]), Number(match[4])]
                },
                source: {
                    kind: 'instruction',
                    index: instructionIndex,
                    text: compact
                }
            });
        }

        match = compact.match(SET_ROTATION_PATTERN);
        if (match) {
            return freezeCommand({
                commandId,
                type: COMMAND_TYPE.SET_OBJECT_TRANSFORM,
                args: {
                    objectId: match[1],
                    rotation: [Number(match[2]), Number(match[3]), Number(match[4])]
                },
                source: {
                    kind: 'instruction',
                    index: instructionIndex,
                    text: compact
                }
            });
        }

        match = compact.match(SET_SCALE_PATTERN);
        if (match) {
            return freezeCommand({
                commandId,
                type: COMMAND_TYPE.SET_OBJECT_TRANSFORM,
                args: {
                    objectId: match[1],
                    scale: [Number(match[2]), Number(match[3]), Number(match[4])]
                },
                source: {
                    kind: 'instruction',
                    index: instructionIndex,
                    text: compact
                }
            });
        }

        return null;
    },
    normalizeRaw({ commandId, rawIndex, args }) {
        const out = {
            objectId: assertString(args.objectId, `commands[${rawIndex}].args.objectId`)
        };
        if (args.position !== undefined) out.position = normalizeVec3(args.position, `commands[${rawIndex}].args.position`);
        if (args.rotation !== undefined) out.rotation = normalizeVec3(args.rotation, `commands[${rawIndex}].args.rotation`);
        if (args.scale !== undefined) out.scale = normalizeVec3(args.scale, `commands[${rawIndex}].args.scale`);
        if (!out.position && !out.rotation && !out.scale) {
            throw new Error(`[MeshCommandPipeline] commands[${rawIndex}] set_object_transform requires position/rotation/scale.`);
        }
        return freezeCommand({
            commandId,
            type: COMMAND_TYPE.SET_OBJECT_TRANSFORM,
            args: out,
            source: {
                kind: 'command',
                index: rawIndex
            }
        });
    },
    execute({ command, runtime }) {
        const objectId = assertString(command.args.objectId, `${command.commandId}.args.objectId`);
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
        if (command.args.position !== undefined) {
            override.position = normalizeVec3(command.args.position, `${command.commandId}.args.position`);
        }
        if (command.args.rotation !== undefined) {
            override.rotation = normalizeVec3(command.args.rotation, `${command.commandId}.args.rotation`);
        }
        if (command.args.scale !== undefined) {
            override.scale = normalizeVec3(command.args.scale, `${command.commandId}.args.scale`);
        }

        return Object.freeze({
            status: 'applied',
            message: '',
            targetIds: Object.freeze([objectId]),
            outputIds: Object.freeze([objectId]),
            markers: Object.freeze([])
        });
    }
});
