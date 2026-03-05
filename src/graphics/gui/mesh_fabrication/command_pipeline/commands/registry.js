// Command registry/dispatcher for mesh fabrication command modules.

import { booleanIntersectCommandModule } from './booleanIntersectCommand.js';
import { booleanSubtractCommandModule } from './booleanSubtractCommand.js';
import { booleanUnionCommandModule } from './booleanUnionCommand.js';
import { cutFaceSlotCommandModule } from './cutFaceSlotCommand.js';
import { imprintTopologyCommandModule } from './imprintTopologyCommand.js';
import { needsClarificationCommandModule } from './needsClarificationCommand.js';
import { setObjectMaterialCommandModule } from './setObjectMaterialCommand.js';
import { setObjectTransformCommandModule } from './setObjectTransformCommand.js';
import { sliceTopologyCommandModule } from './sliceTopologyCommand.js';
import { translateObjectCommandModule } from './translateObjectCommand.js';

export const COMMAND_MODULES = Object.freeze([
    translateObjectCommandModule,
    setObjectTransformCommandModule,
    setObjectMaterialCommandModule,
    cutFaceSlotCommandModule,
    booleanUnionCommandModule,
    booleanSubtractCommandModule,
    booleanIntersectCommandModule,
    imprintTopologyCommandModule,
    sliceTopologyCommandModule,
    needsClarificationCommandModule
]);

const COMMAND_MODULE_BY_TYPE = new Map(COMMAND_MODULES.map((module) => [module.type, module]));
const INSTRUCTION_PARSER_MODULES = Object.freeze(
    COMMAND_MODULES.filter((module) => typeof module.parseInstruction === 'function')
);

export function getCommandModule(type) {
    return COMMAND_MODULE_BY_TYPE.get(type) ?? null;
}

export function getInstructionParserModules() {
    return INSTRUCTION_PARSER_MODULES;
}

export function getNeedsClarificationModule() {
    return needsClarificationCommandModule;
}

export function listRegisteredCommandTypes() {
    return Object.freeze(COMMAND_MODULES.map((module) => module.type));
}
