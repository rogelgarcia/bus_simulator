// Slice-topology command module (hook-only placeholder).

import { COMMAND_TYPE } from './commandTypes.js';
import {
    assertString,
    freezeCommand
} from './shared/commandCommon.js';

function normalizeHookArgs(args, label) {
    return Object.freeze({
        targetObjectId: assertString(
            args.targetObjectId ?? args.targetId ?? args.objectId,
            `${label}.targetObjectId`
        ),
        toolObjectId: assertString(
            args.toolObjectId ?? args.toolId ?? args.cutterObjectId,
            `${label}.toolObjectId`
        )
    });
}

export const sliceTopologyCommandModule = Object.freeze({
    type: COMMAND_TYPE.TOPOLOGY_SLICE,
    mode: 'hook',
    normalizeRaw({ commandId, rawIndex, args }) {
        return freezeCommand({
            commandId,
            type: COMMAND_TYPE.TOPOLOGY_SLICE,
            args: normalizeHookArgs(args, `commands[${rawIndex}].args`),
            source: {
                kind: 'command',
                index: rawIndex
            }
        });
    },
    execute() {
        return Object.freeze({
            status: 'needs_clarification',
            message: 'topology_cut_operation_defined_but_not_executable',
            targetIds: Object.freeze([]),
            outputIds: Object.freeze([]),
            markers: Object.freeze([])
        });
    }
});
