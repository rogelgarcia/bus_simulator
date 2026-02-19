// Writes deterministic per-texture correction config JS modules.
import fs from 'node:fs/promises';
import path from 'node:path';

import {
    CORRECTION_CONFIG_FILE,
    CORRECTION_CONFIG_SCHEMA,
    CORRECTION_CONFIG_VERSION,
    TOOL_ENTRY,
    TOOL_ID
} from './constants.mjs';
import { sortObjectKeysDeep, toPosixPath } from './utils.mjs';

function buildCorrectionConfigObject({
    material,
    presetId,
    profileId,
    enabledPlugins,
    pluginOutputs,
    adjustments,
    warnings,
    analysis
}) {
    return Object.freeze({
        schema: CORRECTION_CONFIG_SCHEMA,
        version: CORRECTION_CONFIG_VERSION,
        toolId: TOOL_ID,
        toolEntry: TOOL_ENTRY,
        materialId: material.materialId,
        classId: material.classId,
        label: material.label ?? '',
        textureFolder: material.textureFolder,
        sourceConfigFile: material.sourceConfigFile,
        mapFiles: sortObjectKeysDeep(material.mapFiles),
        resolvedMapFiles: sortObjectKeysDeep(material.resolvedMapFiles),
        analysis: sortObjectKeysDeep(analysis ?? {}),
        presets: Object.freeze({
            [presetId]: Object.freeze({
                profileId,
                enabledPlugins: [...enabledPlugins],
                pluginOutputs: sortObjectKeysDeep(pluginOutputs),
                adjustments: sortObjectKeysDeep(adjustments),
                warnings: [...warnings]
            })
        })
    });
}

function serializeConfigModule(configObject) {
    const payload = JSON.stringify(sortObjectKeysDeep(configObject), null, 4);
    return `export default Object.freeze(${payload});\n`;
}

function makeOutputPath({ repoRoot, textureFolder }) {
    return path.resolve(repoRoot, textureFolder, CORRECTION_CONFIG_FILE);
}

export async function writeCorrectionConfig({
    repoRoot,
    material,
    presetId,
    profileId,
    enabledPlugins,
    pluginOutputs,
    adjustments,
    warnings,
    analysis,
    write = true
}) {
    const outputFileAbs = makeOutputPath({ repoRoot, textureFolder: material.textureFolder });
    const outputFileRel = toPosixPath(path.relative(repoRoot, outputFileAbs));
    const configObject = buildCorrectionConfigObject({
        material,
        presetId,
        profileId,
        enabledPlugins,
        pluginOutputs,
        adjustments,
        warnings,
        analysis
    });
    const content = serializeConfigModule(configObject);

    let current = null;
    try {
        current = await fs.readFile(outputFileAbs, 'utf8');
    } catch {
        current = null;
    }

    const changed = current !== content;
    if (write && changed) {
        await fs.writeFile(outputFileAbs, content, 'utf8');
    }

    if (!changed) {
        return Object.freeze({
            outputFile: outputFileRel,
            status: 'unchanged'
        });
    }

    return Object.freeze({
        outputFile: outputFileRel,
        status: write ? (current == null ? 'created' : 'updated') : (current == null ? 'would_create' : 'would_update')
    });
}
