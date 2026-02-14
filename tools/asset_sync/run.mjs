// tools/asset_sync/run.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

const DEFAULT_SOURCE = path.resolve(repoRoot, '../../bus_simulator/assets');
const DEFAULT_DEST = path.resolve(repoRoot, 'assets');

function printUsage() {
    console.log('assetSync');
    console.log('');
    console.log('Usage:');
    console.log('  node tools/asset_sync/run.mjs [options]');
    console.log('');
    console.log('Options:');
    console.log(`  --from <path>           Source assets directory (default: ${DEFAULT_SOURCE})`);
    console.log(`  --to <path>             Destination assets directory (default: ${DEFAULT_DEST})`);
    console.log('  --dry-run               Print actions only');
    console.log('  --help                  Show this help');
}

function parseArgs(argv) {
    const out = {
        fromPath: DEFAULT_SOURCE,
        toPath: DEFAULT_DEST,
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
        if (token === '--from') {
            out.fromPath = String(argv[i + 1] ?? '').trim();
            i += 1;
            continue;
        }
        if (token.startsWith('--from=')) {
            out.fromPath = String(token.slice('--from='.length)).trim();
            continue;
        }
        if (token === '--to') {
            out.toPath = String(argv[i + 1] ?? '').trim();
            i += 1;
            continue;
        }
        if (token.startsWith('--to=')) {
            out.toPath = String(token.slice('--to='.length)).trim();
            continue;
        }
        throw new Error(`Unknown argument: ${token}`);
    }

    if (!out.fromPath) throw new Error('--from cannot be empty.');
    if (!out.toPath) throw new Error('--to cannot be empty.');
    return out;
}

function resolvePathFromRepo(maybeRelativePath) {
    if (path.isAbsolute(maybeRelativePath)) return path.resolve(maybeRelativePath);
    return path.resolve(repoRoot, maybeRelativePath);
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

    const sourcePath = resolvePathFromRepo(options.fromPath);
    const destinationPath = resolvePathFromRepo(options.toPath);

    if (sourcePath === destinationPath) {
        throw new Error('Source and destination are the same path. Choose a different source path.');
    }

    await assertDirectory(sourcePath, 'Source directory');

    if (options.dryRun) {
        console.log('[assetSync] Dry run:');
        console.log(`  source path:   ${sourcePath}`);
        console.log(`  destination:   ${destinationPath}`);
        return;
    }

    await fs.mkdir(destinationPath, { recursive: true });
    const entries = await fs.readdir(sourcePath, { withFileTypes: true });
    for (const entry of entries) {
        const from = path.join(sourcePath, entry.name);
        const to = path.join(destinationPath, entry.name);
        await fs.cp(from, to, { recursive: true, force: true });
    }

    console.log('[assetSync] Copied assets folder contents:');
    console.log(`  from: ${sourcePath}`);
    console.log(`  to:   ${destinationPath}`);
}

run().catch((err) => {
    console.error('[assetSync] Failed:', err?.message ?? err);
    process.exitCode = 1;
});
