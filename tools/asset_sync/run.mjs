// tools/asset_sync/run.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

const DEFAULT_MAIN_ROOT = path.resolve(repoRoot, '../../bus_simulator');
const DEFAULT_WORKTREE_ROOT = repoRoot;
const DEFAULT_LINK_NAMES = ['assets', 'downloads', 'docs'];

function printUsage() {
    console.log('assetSync');
    console.log('');
    console.log('Usage:');
    console.log('  node tools/asset_sync/run.mjs [options]');
    console.log('');
    console.log('Options:');
    console.log(`  --main-root <path>      Main repo root containing shared folders (default: ${DEFAULT_MAIN_ROOT})`);
    console.log(`  --worktree-root <path>  Worktree root to receive symlinks (default: ${DEFAULT_WORKTREE_ROOT})`);
    console.log('  --from <path>           Override: single source directory to symlink');
    console.log('  --to <path>             Override: single destination path to replace with symlink');
    console.log('  --dry-run               Print actions only');
    console.log('  --help                  Show this help');
}

function parseArgs(argv) {
    const out = {
        mainRoot: DEFAULT_MAIN_ROOT,
        worktreeRoot: DEFAULT_WORKTREE_ROOT,
        fromPath: '',
        toPath: '',
        fromProvided: false,
        toProvided: false,
        dryRun: false,
        help: false
    };

    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i];
        if (token === '--help' || token === '-h') {
            out.help = true;
            continue;
        }
        if (token === '--dry-run') {
            out.dryRun = true;
            continue;
        }
        if (token === '--main-root') {
            out.mainRoot = String(argv[i + 1] ?? '').trim();
            i += 1;
            continue;
        }
        if (token.startsWith('--main-root=')) {
            out.mainRoot = String(token.slice('--main-root='.length)).trim();
            continue;
        }
        if (token === '--worktree-root') {
            out.worktreeRoot = String(argv[i + 1] ?? '').trim();
            i += 1;
            continue;
        }
        if (token.startsWith('--worktree-root=')) {
            out.worktreeRoot = String(token.slice('--worktree-root='.length)).trim();
            continue;
        }
        if (token === '--reverse') {
            throw new Error('--reverse is not supported in symlink mode. Use --from and --to for explicit paths.');
        }
        if (token === '--from') {
            out.fromPath = String(argv[i + 1] ?? '').trim();
            out.fromProvided = true;
            i += 1;
            continue;
        }
        if (token.startsWith('--from=')) {
            out.fromPath = String(token.slice('--from='.length)).trim();
            out.fromProvided = true;
            continue;
        }
        if (token === '--to') {
            out.toPath = String(argv[i + 1] ?? '').trim();
            out.toProvided = true;
            i += 1;
            continue;
        }
        if (token.startsWith('--to=')) {
            out.toPath = String(token.slice('--to='.length)).trim();
            out.toProvided = true;
            continue;
        }
        throw new Error(`Unknown argument: ${token}`);
    }

    if (!out.mainRoot) throw new Error('--main-root cannot be empty.');
    if (!out.worktreeRoot) throw new Error('--worktree-root cannot be empty.');
    if (out.fromProvided !== out.toProvided) {
        throw new Error('--from and --to must be provided together when overriding a single link.');
    }
    if (out.fromProvided && !out.fromPath) throw new Error('--from cannot be empty.');
    if (out.toProvided && !out.toPath) throw new Error('--to cannot be empty.');
    return out;
}

function resolvePathFromRepo(maybeRelativePath) {
    if (path.isAbsolute(maybeRelativePath)) return path.resolve(maybeRelativePath);
    return path.resolve(repoRoot, maybeRelativePath);
}

function computeSymlinkTarget(sourcePath, destinationPath) {
    const destinationParent = path.dirname(destinationPath);
    return path.relative(destinationParent, sourcePath) || '.';
}

function buildDefaultMappings(mainRootPath, worktreeRootPath) {
    return DEFAULT_LINK_NAMES.map((name) => ({
        label: name,
        sourcePath: path.resolve(mainRootPath, name),
        destinationPath: path.resolve(worktreeRootPath, name)
    }));
}

function buildMappings(options) {
    if (options.fromProvided && options.toProvided) {
        return [{
            label: 'custom',
            sourcePath: resolvePathFromRepo(options.fromPath),
            destinationPath: resolvePathFromRepo(options.toPath)
        }];
    }
    const mainRootPath = resolvePathFromRepo(options.mainRoot);
    const worktreeRootPath = resolvePathFromRepo(options.worktreeRoot);
    return buildDefaultMappings(mainRootPath, worktreeRootPath);
}

async function assertDirectory(absPath, label) {
    try {
        const stat = await fs.stat(absPath);
        if (!stat.isDirectory()) {
            throw new Error(`${label} is not a directory: ${absPath}`);
        }
    } catch (err) {
        throw new Error(`${label} not found: ${absPath}`, { cause: err });
    }
}

async function run() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printUsage();
        return;
    }

    const mappings = buildMappings(options);
    if (mappings.length === 0) throw new Error('No mappings to process.');

    for (const mapping of mappings) {
        if (mapping.sourcePath === mapping.destinationPath) {
            throw new Error(`Source and destination are the same path for "${mapping.label}": ${mapping.sourcePath}`);
        }
        await assertDirectory(mapping.sourcePath, `Source directory for "${mapping.label}"`);
    }

    if (options.dryRun) {
        console.log('[assetSync] Dry run:');
        for (const mapping of mappings) {
            const symlinkTarget = computeSymlinkTarget(mapping.sourcePath, mapping.destinationPath);
            console.log(`  [${mapping.label}] source path: ${mapping.sourcePath}`);
            console.log(`  [${mapping.label}] destination: ${mapping.destinationPath}`);
            console.log(`  [${mapping.label}] remove path: ${mapping.destinationPath}`);
            console.log(`  [${mapping.label}] symlink to:  ${symlinkTarget}`);
        }
        return;
    }

    for (const mapping of mappings) {
        const destinationParent = path.dirname(mapping.destinationPath);
        const symlinkTarget = computeSymlinkTarget(mapping.sourcePath, mapping.destinationPath);
        await fs.mkdir(destinationParent, { recursive: true });
        await fs.rm(mapping.destinationPath, { recursive: true, force: true });
        await fs.symlink(symlinkTarget, mapping.destinationPath);

        console.log('[assetSync] Replaced destination with symlink:');
        console.log(`  label:     ${mapping.label}`);
        console.log(`  link path: ${mapping.destinationPath}`);
        console.log(`  target:    ${mapping.sourcePath}`);
    }
}

run().catch((err) => {
    console.error('[assetSync] Failed:', err?.message ?? err);
    process.exitCode = 1;
});
