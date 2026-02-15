// Creates or reuses a named git worktree, then runs assetSync inside it.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

const DEFAULT_WORKTREES_ROOT = path.resolve(repoRoot, '../bus_simulator_worktrees');

function printUsage() {
    console.log('worktreeCreateAndSync');
    console.log('');
    console.log('Usage:');
    console.log('  node tools/worktree_create_and_sync/run.mjs <name> [options]');
    console.log('');
    console.log('Arguments:');
    console.log('  <name>                  Branch/worktree name');
    console.log('');
    console.log('Options:');
    console.log(`  --root <path>           Worktrees root directory (default: ${DEFAULT_WORKTREES_ROOT})`);
    console.log('  --asset-sync-args "<args>"');
    console.log('                          Extra args forwarded to assetSync');
    console.log('  --dry-run               Print commands only');
    console.log('  --help                  Show this help');
}

function parseArgs(argv) {
    const out = {
        name: '',
        root: DEFAULT_WORKTREES_ROOT,
        assetSyncArgs: '',
        dryRun: false,
        help: false
    };

    for (let i = 0; i < argv.length; i += 1) {
        const token = String(argv[i] ?? '');
        if (!token) continue;
        if (token === '--help' || token === '-h') {
            out.help = true;
            continue;
        }
        if (token === '--dry-run') {
            out.dryRun = true;
            continue;
        }
        if (token === '--root') {
            out.root = String(argv[i + 1] ?? '').trim();
            i += 1;
            continue;
        }
        if (token.startsWith('--root=')) {
            out.root = token.slice('--root='.length).trim();
            continue;
        }
        if (token === '--asset-sync-args') {
            out.assetSyncArgs = String(argv[i + 1] ?? '').trim();
            i += 1;
            continue;
        }
        if (token.startsWith('--asset-sync-args=')) {
            out.assetSyncArgs = token.slice('--asset-sync-args='.length).trim();
            continue;
        }
        if (token.startsWith('--')) {
            throw new Error(`Unknown option: ${token}`);
        }
        if (!out.name) {
            out.name = token.trim();
            continue;
        }
        throw new Error(`Unexpected argument: ${token}`);
    }

    if (!out.help && !out.name) throw new Error('Missing required argument: <name>');
    if (!out.help && !out.root) throw new Error('--root cannot be empty');
    return out;
}

function isSafeRefName(name) {
    if (!name) return false;
    if (name.startsWith('-')) return false;
    if (name.includes('..')) return false;
    if (name.includes('\\')) return false;
    if (name.includes(' ')) return false;
    if (name.endsWith('/')) return false;
    return true;
}

function runGit(args, options = {}) {
    const cmd = ['git', ...args];
    if (options.dryRun) {
        console.log(`[dry-run] ${cmd.join(' ')}`);
        return { status: 0, stdout: '' };
    }
    const result = spawnSync('git', args, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
    });
    if (result.status !== 0) {
        const errOut = options.capture ? (result.stderr || result.stdout || '') : '';
        throw new Error(`git command failed: ${cmd.join(' ')}${errOut ? `\n${errOut}` : ''}`);
    }
    return result;
}

function branchExists(name, dryRun) {
    if (dryRun) return false;
    const result = spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${name}`], {
        cwd: repoRoot,
        stdio: 'ignore'
    });
    return result.status === 0;
}

function listWorktrees() {
    const result = runGit(['worktree', 'list', '--porcelain'], { capture: true });
    const lines = String(result.stdout || '').split(/\r?\n/);
    const out = [];
    let current = null;
    for (const line of lines) {
        if (!line) {
            if (current) out.push(current);
            current = null;
            continue;
        }
        if (line.startsWith('worktree ')) {
            if (current) out.push(current);
            current = { path: line.slice('worktree '.length).trim(), branch: null };
            continue;
        }
        if (line.startsWith('branch ') && current) {
            const ref = line.slice('branch '.length).trim();
            current.branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
        }
    }
    if (current) out.push(current);
    return out;
}

function runInWorktree(worktreePath, command, args, { dryRun = false } = {}) {
    const printable = [command, ...args].join(' ');
    if (dryRun) {
        console.log(`[dry-run] (cd ${worktreePath} && ${printable})`);
        return;
    }
    const result = spawnSync(command, args, {
        cwd: worktreePath,
        stdio: 'inherit',
        encoding: 'utf8'
    });
    if (result.status !== 0) {
        throw new Error(`Command failed in worktree: ${printable}`);
    }
}

function splitForwardedArgs(raw) {
    if (!raw) return [];
    return raw.split(/\s+/).filter(Boolean);
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printUsage();
        return;
    }

    const name = args.name;
    if (!isSafeRefName(name)) {
        throw new Error(`Unsafe branch/worktree name: "${name}"`);
    }

    const rootAbs = path.isAbsolute(args.root) ? path.resolve(args.root) : path.resolve(repoRoot, args.root);
    const worktreePath = path.resolve(rootAbs, name);
    const worktrees = args.dryRun ? [] : listWorktrees();
    const existingByPath = worktrees.find((w) => path.resolve(w.path) === worktreePath) ?? null;
    const existingByBranch = worktrees.find((w) => w.branch === name) ?? null;

    if (existingByBranch && !existingByPath) {
        throw new Error(`Branch "${name}" is already checked out at ${existingByBranch.path}. Choose another name/path.`);
    }

    if (!args.dryRun) fs.mkdirSync(rootAbs, { recursive: true });

    if (existingByPath) {
        if (existingByPath.branch && existingByPath.branch !== name) {
            throw new Error(`Worktree path exists but points to branch "${existingByPath.branch}", expected "${name}".`);
        }
        console.log(`[worktreeCreateAndSync] Reusing existing worktree: ${worktreePath}`);
    } else {
        const hasBranch = branchExists(name, args.dryRun);
        if (hasBranch) {
            runGit(['worktree', 'add', worktreePath, name], { dryRun: args.dryRun });
        } else {
            runGit(['worktree', 'add', worktreePath, '-b', name], { dryRun: args.dryRun });
        }
        console.log(`[worktreeCreateAndSync] Created worktree: ${worktreePath}`);
    }

    const forwarded = splitForwardedArgs(args.assetSyncArgs);
    runInWorktree(worktreePath, 'node', ['tools/asset_sync/run.mjs', ...forwarded], { dryRun: args.dryRun });
    console.log(`[worktreeCreateAndSync] Asset sync completed in ${worktreePath}`);
}

try {
    main();
} catch (err) {
    console.error(`[worktreeCreateAndSync] Failed: ${err?.message ?? err}`);
    process.exitCode = 1;
}
