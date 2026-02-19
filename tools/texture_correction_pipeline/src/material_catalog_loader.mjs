// Loads PBR material definitions directly from per-folder JS config sources.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { KNOWN_MAP_KEYS } from './constants.mjs';
import { toPosixPath } from './utils.mjs';

const MATERIAL_CONFIG_FILE = 'pbr.material.config.js';

function normalizeMapFiles(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src) return {};
    const out = {};
    for (const key of KNOWN_MAP_KEYS) {
        const file = typeof src[key] === 'string' ? src[key].trim() : '';
        if (!file) continue;
        out[key] = file;
    }
    return out;
}

function resolveMapAssetPath({ textureFolderRel, fileName }) {
    const raw = String(fileName ?? '').trim();
    if (!raw) return null;
    if (raw.startsWith('assets/')) return toPosixPath(raw);
    const joined = path.posix.join(textureFolderRel, raw);
    return toPosixPath(joined);
}

function normalizeMaterialEntry({ repoRoot, folderName, sourceConfigFile, config }) {
    const materialId = typeof config?.materialId === 'string' ? config.materialId.trim() : '';
    const classId = typeof config?.classId === 'string' ? config.classId.trim() : '';
    if (!materialId) throw new Error('Missing materialId.');
    if (!classId) throw new Error(`Missing classId for ${materialId}.`);

    const label = typeof config?.label === 'string' ? config.label.trim() : '';
    const textureFolderRel = toPosixPath(path.relative(repoRoot, path.resolve(repoRoot, 'assets/public/pbr', folderName)));
    const sourceConfigFileRel = toPosixPath(path.relative(repoRoot, sourceConfigFile));
    const mapFiles = normalizeMapFiles(config?.mapFiles);
    const allMapFiles = normalizeMapFiles(config?.allMapFiles);
    const resolvedMapFiles = {};
    const mapFileSource = { ...mapFiles, ...allMapFiles };
    for (const key of Object.keys(mapFileSource).sort((a, b) => a.localeCompare(b))) {
        const resolved = resolveMapAssetPath({ textureFolderRel, fileName: mapFileSource[key] });
        if (!resolved) continue;
        resolvedMapFiles[key] = resolved;
    }

    return Object.freeze({
        materialId,
        classId,
        label,
        textureFolder: textureFolderRel,
        sourceConfigFile: sourceConfigFileRel,
        mapFiles,
        resolvedMapFiles
    });
}

async function loadMaterialConfigModule(configFileAbs) {
    const configUrl = pathToFileURL(configFileAbs).href;
    const mod = await import(configUrl);
    return mod?.default ?? null;
}

export async function loadPbrMaterialCatalog({ repoRoot, includeMaterialIds, includeClassIds } = {}) {
    const materialFilter = new Set((Array.isArray(includeMaterialIds) ? includeMaterialIds : []).map((id) => String(id).trim()).filter(Boolean));
    const classFilter = new Set((Array.isArray(includeClassIds) ? includeClassIds : []).map((id) => String(id).trim()).filter(Boolean));

    const pbrRoot = path.resolve(repoRoot, 'assets/public/pbr');
    const entries = await fs.readdir(pbrRoot, { withFileTypes: true });
    const folders = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort((a, b) => a.localeCompare(b));

    const materials = [];
    const skipped = [];
    const errors = [];

    for (const folderName of folders) {
        const sourceConfigFile = path.resolve(pbrRoot, folderName, MATERIAL_CONFIG_FILE);
        try {
            await fs.access(sourceConfigFile);
        } catch {
            continue;
        }

        let config = null;
        try {
            config = await loadMaterialConfigModule(sourceConfigFile);
        } catch (err) {
            errors.push(Object.freeze({
                textureFolder: toPosixPath(path.relative(repoRoot, path.dirname(sourceConfigFile))),
                sourceConfigFile: toPosixPath(path.relative(repoRoot, sourceConfigFile)),
                message: err instanceof Error ? err.message : String(err)
            }));
            continue;
        }

        let normalized = null;
        try {
            normalized = normalizeMaterialEntry({ repoRoot, folderName, sourceConfigFile, config });
        } catch (err) {
            errors.push(Object.freeze({
                textureFolder: toPosixPath(path.relative(repoRoot, path.dirname(sourceConfigFile))),
                sourceConfigFile: toPosixPath(path.relative(repoRoot, sourceConfigFile)),
                message: err instanceof Error ? err.message : String(err)
            }));
            continue;
        }

        if (materialFilter.size && !materialFilter.has(normalized.materialId)) {
            skipped.push(Object.freeze({
                materialId: normalized.materialId,
                classId: normalized.classId,
                reason: 'filtered_material_id'
            }));
            continue;
        }

        if (classFilter.size && !classFilter.has(normalized.classId)) {
            skipped.push(Object.freeze({
                materialId: normalized.materialId,
                classId: normalized.classId,
                reason: 'filtered_class_id'
            }));
            continue;
        }

        materials.push(normalized);
    }

    materials.sort((a, b) => a.materialId.localeCompare(b.materialId));

    return Object.freeze({
        scannedFolders: folders.length,
        materials,
        skipped,
        errors
    });
}
