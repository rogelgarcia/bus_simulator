// src/graphics/gui/mesh_fabrication/command_pipeline/stages/parseStage.js

export function runCommandParseStage({ rawAi, parse }) {
    if (typeof parse !== 'function') {
        throw new Error('[CommandParseStage] parse callback is required.');
    }
    return parse(rawAi);
}
