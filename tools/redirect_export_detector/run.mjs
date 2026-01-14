// tools/redirect_export_detector/run.mjs
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_ROOTS = ['src'];
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'assets', 'downloads', 'old_prompts']);

function parseArgs(argv) {
    const opts = { json: false, help: false, roots: [] };
    for (const arg of argv) {
        if (arg === '--json') opts.json = true;
        else if (arg === '--help' || arg === '-h') opts.help = true;
        else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
        else opts.roots.push(arg);
    }
    if (!opts.roots.length) opts.roots = DEFAULT_ROOTS.slice();
    return opts;
}

function printHelp() {
    const text = [
        'Redirect export detector',
        '',
        'Usage:',
        '  node tools/redirect_export_detector/run.mjs [roots...] [--json]',
        '',
        'Defaults:',
        '  roots = src',
        '',
        'Options:',
        '  --json   machine-readable output',
        '  -h,--help  show this help',
        ''
    ].join('\n');
    process.stdout.write(text);
}

function stripCommentsPreserveStrings(source) {
    const s = String(source ?? '');
    let out = '';
    let i = 0;
    let mode = 'code';
    let quote = null;
    let templateDepth = 0;

    while (i < s.length) {
        const c = s[i];
        const n = i + 1 < s.length ? s[i + 1] : '';

        if (mode === 'code') {
            if (c === '/' && n === '/') {
                mode = 'line_comment';
                i += 2;
                continue;
            }
            if (c === '/' && n === '*') {
                mode = 'block_comment';
                i += 2;
                continue;
            }
            if (c === '"' || c === "'") {
                mode = 'string';
                quote = c;
                out += c;
                i += 1;
                continue;
            }
            if (c === '`') {
                mode = 'template';
                templateDepth = 0;
                out += c;
                i += 1;
                continue;
            }
            out += c;
            i += 1;
            continue;
        }

        if (mode === 'line_comment') {
            if (c === '\n') {
                out += '\n';
                mode = 'code';
            }
            i += 1;
            continue;
        }

        if (mode === 'block_comment') {
            if (c === '*' && n === '/') {
                mode = 'code';
                i += 2;
            } else {
                if (c === '\n') out += '\n';
                i += 1;
            }
            continue;
        }

        if (mode === 'string') {
            out += c;
            if (c === '\\\\') {
                if (i + 1 < s.length) out += s[i + 1];
                i += 2;
                continue;
            }
            if (c === quote) {
                mode = 'code';
                quote = null;
            }
            i += 1;
            continue;
        }

        if (mode === 'template') {
            out += c;
            if (c === '\\\\') {
                if (i + 1 < s.length) out += s[i + 1];
                i += 2;
                continue;
            }
            if (c === '$' && n === '{') {
                out += '{';
                i += 2;
                templateDepth += 1;
                mode = 'template_expr';
                continue;
            }
            if (c === '`') {
                mode = 'code';
            }
            i += 1;
            continue;
        }

        if (mode === 'template_expr') {
            if (c === '/' && n === '/') {
                mode = 'line_comment_in_expr';
                i += 2;
                continue;
            }
            if (c === '/' && n === '*') {
                mode = 'block_comment_in_expr';
                i += 2;
                continue;
            }
            if (c === '"' || c === "'") {
                mode = 'string_in_expr';
                quote = c;
                out += c;
                i += 1;
                continue;
            }
            if (c === '`') {
                mode = 'template_in_expr';
                out += c;
                i += 1;
                continue;
            }
            out += c;
            if (c === '{') templateDepth += 1;
            if (c === '}') {
                templateDepth -= 1;
                if (templateDepth <= 0) mode = 'template';
            }
            i += 1;
            continue;
        }

        if (mode === 'line_comment_in_expr') {
            if (c === '\n') {
                out += '\n';
                mode = 'template_expr';
            }
            i += 1;
            continue;
        }

        if (mode === 'block_comment_in_expr') {
            if (c === '*' && n === '/') {
                mode = 'template_expr';
                i += 2;
            } else {
                if (c === '\n') out += '\n';
                i += 1;
            }
            continue;
        }

        if (mode === 'string_in_expr') {
            out += c;
            if (c === '\\\\') {
                if (i + 1 < s.length) out += s[i + 1];
                i += 2;
                continue;
            }
            if (c === quote) {
                mode = 'template_expr';
                quote = null;
            }
            i += 1;
            continue;
        }

        if (mode === 'template_in_expr') {
            out += c;
            if (c === '\\\\') {
                if (i + 1 < s.length) out += s[i + 1];
                i += 2;
                continue;
            }
            if (c === '`') mode = 'template_expr';
            i += 1;
            continue;
        }
    }

    return out;
}

const EXPORT_FROM_RE = /^export\s+(?:\*\s+as\s+[A-Za-z_$][\w$]*\s+from|\*\s+from|\{[\s\S]*?\}\s+from)\s*(?<q>['"])(?<target>[^'"]+)\k<q>\s*/;

function analyzeRedirectShim(source) {
    const stripped = stripCommentsPreserveStrings(source).replace(/^\uFEFF/, '');
    let rest = stripped.trim();
    if (!rest) return null;

    const targets = [];
    let statements = 0;

    while (rest.length) {
        rest = rest.replace(/^[\s;]+/, '');
        if (!rest.length) break;

        const m = rest.match(EXPORT_FROM_RE);
        if (!m) return null;

        const target = m.groups?.target ?? null;
        if (typeof target === 'string' && target.length) targets.push(target);
        rest = rest.slice(m[0].length);
        statements += 1;
    }

    if (!statements) return null;
    const distinctTargets = Array.from(new Set(targets));
    const reason = `Only re-export statements (${statements})`;
    return { targets: distinctTargets, reason };
}

async function statSafe(p) {
    try {
        return await fs.stat(p);
    } catch {
        return null;
    }
}

async function collectJsFiles(rootPath) {
    const files = [];
    const st = await statSafe(rootPath);
    if (!st) return files;

    if (st.isFile()) {
        if (rootPath.endsWith('.js')) files.push(rootPath);
        return files;
    }

    if (!st.isDirectory()) return files;

    const stack = [rootPath];
    while (stack.length) {
        const dir = stack.pop();
        let entries = [];
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const ent of entries) {
            if (ent.isDirectory()) {
                if (EXCLUDED_DIRS.has(ent.name)) continue;
                stack.push(path.join(dir, ent.name));
                continue;
            }
            if (!ent.isFile()) continue;
            if (!ent.name.endsWith('.js')) continue;
            files.push(path.join(dir, ent.name));
        }
    }
    return files;
}

function formatHuman(results, meta) {
    const lines = [];
    lines.push(`Redirect re-export shims: ${results.length}`);
    lines.push(`Scanned .js files: ${meta.scannedFiles}`);
    for (const r of results) {
        const targets = r.targets.length ? r.targets.join(', ') : '(none)';
        lines.push(`- ${r.file} -> ${targets}`);
        lines.push(`  ${r.reason}`);
    }
    return `${lines.join('\n')}\n`;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
        printHelp();
        return;
    }

    const roots = opts.roots.map((p) => String(p));
    const jsFiles = [];
    for (const root of roots) {
        const list = await collectJsFiles(root);
        for (const f of list) jsFiles.push(f);
    }

    const results = [];
    for (const filePath of jsFiles) {
        let text = '';
        try {
            text = await fs.readFile(filePath, 'utf8');
        } catch {
            continue;
        }
        const r = analyzeRedirectShim(text);
        if (!r) continue;
        results.push({
            file: filePath.replace(/\\\\/g, '/'),
            targets: r.targets,
            reason: r.reason
        });
    }

    results.sort((a, b) => a.file.localeCompare(b.file));
    const meta = { roots, scannedFiles: jsFiles.length };

    if (opts.json) {
        process.stdout.write(`${JSON.stringify({ meta, results }, null, 2)}\n`);
        return;
    }

    process.stdout.write(formatHuman(results, meta));
}

try {
    await main();
} catch (err) {
    process.stderr.write(`${String(err?.stack ?? err)}\n`);
    process.exitCode = 1;
}
