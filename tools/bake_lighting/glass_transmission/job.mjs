// Explicit bounded glass transport leaf; never certifies unsupported full-city transport.
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { bakeThinGlassTransport, validateThinGlassBake } from '../../../src/app/illumination/ThinGlassTransport.js';
import { writeJson } from '../../baking/Files.mjs';

const TOOL = 'tools/bake_lighting/glass_transmission';
export const glassTransmissionJob = {
    id: 'lighting/illumination/glass-transmission', description: 'Bounded static parallel thin-sheet colored sunlight',
    configurationPaths: [], codePaths: [TOOL], always: true,
    options: { input: String, output: String },
    async inputs(ctx) { return [path.resolve(ctx.root, ctx.options.input || `${TOOL}/profile.json`), path.join(ctx.root, 'src/app/illumination/ThinGlassTransport.js')]; },
    async run(ctx) {
        if (ctx.publish) throw new Error('Bounded glass fixture cannot publish city assets');
        const output = path.resolve(ctx.root, ctx.options.output || 'tests/artifacts/screens/buildings/burban/ai549/transport');
        if (!output.startsWith(path.join(ctx.root, 'tests/artifacts/screens') + path.sep)) throw new Error('Glass evidence output must remain under tests/artifacts/screens');
        const profile = JSON.parse(await readFile(path.resolve(ctx.root, ctx.options.input || `${TOOL}/profile.json`), 'utf8'));
        const bake = bakeThinGlassTransport(profile);
        if (!validateThinGlassBake(bake, profile)) throw new Error('Glass bake profile did not validate');
        await mkdir(output, { recursive: true });
        const file = path.join(output, 'transport.json');
        await writeJson(file, bake);
        return { state: 'validated', files: [file], output, supported: 'fixed planar thin panes, directional sun, static horizontal receiver',
            unsupported: ['curved/thick refractive caustics', 'volume scattering', 'full-city receivers'], runtimeTextureBytes: bake.width * bake.height * 16 };
    }
};
