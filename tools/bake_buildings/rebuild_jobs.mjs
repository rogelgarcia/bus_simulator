// Registers isolated full authoring workflows with authenticated candidate outputs.
// @ts-check
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { hashFile, listFiles } from '../baking/Files.mjs';

const CITY_PBR = ['asphalt_02', 'rough_concrete', 'brown_mud', 'rock_ground', 'plastered_wall_02',
    'plastered_wall_05', 'corrugated_iron_02', 'red_brick', 'painted_plaster_wall',
    'beige_wall_001', 'plastered_wall_04', 'brick_wall_13', 'whitewashed_brick'];
const PBR = ['asphalt_02', 'beige_wall_001', 'bradbury_cornice_weathered_terracotta', 'bradbury_entrance_terracotta',
    'bradbury_flower_tiles', 'bradbury_frieze_flowers', 'bradbury_lettering', 'bradbury_sandstone_dressed',
    'bradbury_storefront_pillars_taupe', 'bradbury_top_band_terracotta_ornament', 'bradbury_wall_terracotta_brick_tileable',
    'brick_wall_13', 'brown_mud', 'brownstone', 'concrete', 'concrete_pavement', 'corrugated_iron_02', 'limestone_smooth',
    'painted_plaster_wall', 'plastered_wall_02', 'plastered_wall_04', 'plastered_wall_05', 'red_brick',
    'red_sandstone_block', 'red_sandstone_noise', 'rock_ground', 'rough_concrete', 'seaworn_sandstone_brick',
    'terracotta_smooth', 'terramar_continuous_limestone', 'terramar_sign_coastal_kitchen', 'terramar_sign_terra_and_mar',
    'whitewashed_brick'];

/** @param {string} id @param {'all'|'bradbury'|'terramar'|'city'} target */
export function createRebuildJob(id, target) {
    return {
        id, configurationPaths: ['executable', 'pythonExecutable'], always: true,
        description: `Regenerate ${target} from preserved inputs and installed assets in a clean candidate root`,
        outputs: [`blender_files/rebuild-candidates/${target}`],
        async inputs(ctx) {
            if (ctx.publish) throw new Error('Full regeneration creates candidates only; --publish is not supported');
            const heroes = target === 'all' ? ['bradbury', 'terramar'] : target === 'city' ? [] : [target];
            const directories = ['blender/scripts/common', 'blender/scripts/city',
                ...heroes.map(hero => `blender/scripts/${hero}`), 'assets/trees/Models/Desktop', 'assets/trees/Textures',
                'assets/props/street_lamp_01', ...(heroes.length ? PBR : CITY_PBR).map(name => `assets/public/pbr/${name}`)];
            const extra = ['assets/public/lighting/hdri/kloofendal_43d_clear_puresky_4k.hdr'];
            if (heroes.includes('bradbury')) {
                directories.push('assets/public/textures/bradbury_capital', 'assets/public/textures/bradbury_portal');
                const provenance = 'blender_inputs/bradbury/baseline/source.json';
                const data = JSON.parse(await readFile(path.join(ctx.root, provenance), 'utf8'));
                extra.push(provenance, ...data.baseline_import.inputs.map(entry => entry.file));
            }
            if (heroes.includes('terramar')) {
                directories.push('assets/public/vegetation_lod0', 'tools/bake_vegetation/lod0', 'downloads/tools/ktx-4.4.2');
                extra.push('blender_inputs/terramar/baseline/terramar_recessed_before.glb',
                    'blender_inputs/terramar/baseline/terramar_recessed_before.json',
                    'assets/public/lighting/calibrated/clear-afternoon-55.hdr',
                    'assets/public/lighting/hdri/german_town_street_2k.hdr');
            }
            const files = (await Promise.all(directories.map(directory => listFiles(path.join(ctx.root, directory))))).flat()
                .filter(file => !file.includes('__pycache__'));
            const metadata = heroes.length
                ? (await listFiles(path.join(ctx.root, 'assets/public/pbr'))).filter(file => file.endsWith('.js')) : [];
            return [...new Set([...files, ...metadata,
                ...extra.map(file => path.join(ctx.root, file)),
                path.join(ctx.root, 'tools/bake_buildings/rebuild_jobs.mjs'), process.execPath,
                ctx.config.executable, ctx.config.pythonExecutable])];
        },
        async run(ctx) {
            const filesRoot = path.resolve(process.env.BLENDER_FILES_ROOT || path.join(ctx.root, 'blender_files'));
            const depth = id.split('/').length;
            let runRoot = ctx.stage;
            for (let i = 0; i < depth; i++) runRoot = path.dirname(runRoot);
            const output = path.join(filesRoot, 'rebuild-candidates', target, path.basename(runRoot));
            const report = path.join(ctx.stage, 'rebuild-validation.json');
            const script = `blender/scripts/${target === 'all' ? 'common' : target}/rebuild_all.py`;
            await ctx.process(ctx.config.pythonExecutable, ['-I', path.join(ctx.root, script), '--files-root', filesRoot,
                '--output-root', output, '--report', report, '--blender', ctx.config.executable,
                '--python', ctx.config.pythonExecutable, '--node', process.execPath]);
            const data = JSON.parse(await readFile(report, 'utf8'));
            return { state: 'validated', output, report, files: [report, ...data.files.map(entry => entry.file)] };
        },
        async validate(result) {
            const data = JSON.parse(await readFile(result.report, 'utf8'));
            if (!data.passed || !data.empty_start || data.output_root !== result.output || data.target !== target) {
                throw new Error('Full regeneration receipt does not authenticate its candidate');
            }
            for (const entry of data.files) {
                if ((await hashFile(entry.file)).sha256 !== entry.sha256) throw new Error(`Rebuilt output changed: ${entry.file}`);
            }
        }
    };
}

export const rebuildJobs = Object.freeze([
    createRebuildJob('buildings/rebuild-all', 'all'),
    createRebuildJob('buildings/bradbury/rebuild', 'bradbury'),
    createRebuildJob('buildings/terramar/rebuild', 'terramar')
]);
