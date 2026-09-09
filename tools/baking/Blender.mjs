// Verifies the installed pinned toolchain and isolates each headless Blender invocation.
// @ts-check
import path from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import { verifyBlenderExecutable, verifyBlenderArchive } from '../illumination_bake_compiler/src/BlenderToolchain.mjs';

/** @param {any} config @param {string} root @param {boolean} needsArchive */
export async function verifyBakeToolchain(config, root, needsArchive) {
    const contract = JSON.parse(await readFile(path.join(root, 'tools/illumination_bake_compiler/toolchain.v1.json'), 'utf8'));
    if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('The current lighting backend is certified for Windows x64 Blender 5.2.1 only. Add a reviewed platform toolchain contract before baking on another platform. The framework CLI and non-Blender jobs are portable.');
    const executable = await verifyBlenderExecutable({ executablePath: config.executable, contract: {
        fileName: 'blender.exe', sha256: contract.blender.executableSha256, byteLength: contract.blender.executableByteLength
    } });
    if (needsArchive) {
        if (!config.archive) throw Object.assign(new Error(`Shadow baking requires archive in ${config.path}. Point it at the existing pinned Blender archive; nothing will be downloaded.`), { exitCode: 2 });
        await verifyBlenderArchive({ archivePath: config.archive, contract: { ...contract.archive, sha256: contract.archive.officialSha256 } });
    }
    return { executableSha256: executable.sha256, archiveSha256: contract.archive.officialSha256, contract };
}

/** @param {any} ctx @param {string} script @param {string[]} args */
export async function runHeadlessBake(ctx, script, args) {
    return runBlenderStage(ctx, script, args);
}

/** @param {any} ctx @param {string} script @param {string[]} args @param {{background?:boolean}} options */
export async function runBlenderStage(ctx, script, args, {background = true} = {}) {
    const runtime = path.join(ctx.stage, 'blender-runtime');
    await mkdir(runtime, { recursive: true });
    const previous = ctx.env;
    ctx.env = { ...ctx.env, TEMP: runtime, TMP: runtime, TMPDIR: runtime, BLENDER_USER_CONFIG: path.join(runtime, 'config'),
        BLENDER_USER_EXTENSIONS: path.join(runtime, 'extensions'), PYTHONPATH: '', PYTHONHOME: '',
        PYTHONPYCACHEPREFIX: path.join(runtime, 'python-cache'), PYTHONDONTWRITEBYTECODE: '1',
        OPTIX_CACHE_PATH: path.join(runtime, 'optix-cache'), CUDA_CACHE_PATH: path.join(runtime, 'cuda-cache') };
    try {
        return await ctx.process(ctx.config.executable, ['--python-use-system-env', ...(background ? ['--background'] : []), '--factory-startup',
            '--disable-autoexec', '--offline-mode', '--python-exit-code', '1', '--python', path.join(ctx.root, script), '--', ...args]);
    } finally { ctx.env = previous; }
}
