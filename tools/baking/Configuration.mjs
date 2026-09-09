// Discovers the single machine-local Blender configuration without guessing installations.
// @ts-check
import path from 'node:path';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const CONFIG_PATH = 'tools/baking/blender.local.json';
export const CONFIG_TEMPLATE = Object.freeze({ executable: '', archive: '', browserExecutable: '', pythonExecutable: '', renderDevice: 'CPU' });
const PATH_FIELDS = ['executable', 'archive', 'browserExecutable', 'pythonExecutable'];

/** @param {string} [root] @param {{requiredPaths?:string[], checkedPaths?:string[]}} [requirements]
 * @returns {Promise<{executable:string,archive:string,browserExecutable:string,pythonExecutable:string,renderDevice:string,path:string}>} */
export async function loadBakeConfiguration(root = REPO_ROOT, {requiredPaths = ['executable'], checkedPaths = PATH_FIELDS} = {}) {
    const file = path.join(root, CONFIG_PATH);
    await mkdir(path.dirname(file), { recursive: true });
    try {
        await writeFile(file, JSON.stringify(CONFIG_TEMPLATE, null, 2) + '\n', { flag: 'wx' });
        throw Object.assign(new Error(`Bake setup required. Created ${file}. Configure ${requiredPaths.join(', ') || 'the paths required by your selected stage'}. Nothing was baked.`), { exitCode: 2 });
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
    }
    let value;
    try { value = JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { throw Object.assign(new Error(`Invalid JSON in ${file}: ${error.message}`), { exitCode: 2 }); }
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(`Expected an object in ${file}`);
    for (const key of Object.keys(value)) if (!Object.hasOwn(CONFIG_TEMPLATE, key)) throw new Error(`Unknown configuration field ${key} in ${file}`);
    const result = { ...CONFIG_TEMPLATE, path: file };
    if (value.renderDevice !== undefined && !['CPU', 'OPTIX'].includes(value.renderDevice)) throw new Error(`${file}: renderDevice must be CPU or OPTIX`);
    result.renderDevice = value.renderDevice ?? 'CPU';
    for (const key of PATH_FIELDS) {
        if (typeof value[key] !== 'string' && value[key] !== undefined) throw new Error(`${file}: ${key} must be a path string`);
        if (!value[key]) {
            if (requiredPaths.includes(key)) throw Object.assign(new Error(`Bake setup required: configure ${key} in ${file}`), { exitCode: 2 });
            continue;
        }
        result[key] = path.resolve(root, value[key]);
        if (checkedPaths.includes(key) && !(await stat(result[key]).catch(() => null))?.isFile()) throw Object.assign(new Error(`${file}: ${key} does not name an existing file: ${result[key]}`), { exitCode: 2 });
    }
    return Object.freeze(result);
}
