import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_ROOTS = ['src'];
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.idea', '.vscode']);
const JS_EXTS = new Set(['.js', '.mjs']);
const SHADER_ASSIGN_RE = /\b(vertexShader|fragmentShader)\s*:\s*`([\s\S]*?)`/g;
const SHADER_MARKERS = /\b(?:void\s+main\s*\(|\bvarying\b|\buniform\b|\battribute\b|\bprecision\b|#include\s*<shaderlib:|\bgl_(?:Position|FragColor|Vertex|PointSize)|\bsampler2D\b|\btexture2D\b|\bvUv\b)\b/;

const args = process.argv.slice(2);
const opts = {
    json: false,
    roots: []
};

for (const arg of args) {
    if (arg === '--json') {
        opts.json = true;
    } else if (arg.startsWith('-')) {
        throw new Error(`Unknown option: ${arg}`);
    } else {
        opts.roots.push(arg);
    }
}

if (!opts.roots.length) opts.roots = DEFAULT_ROOTS.slice();

function isExcludedDir(name) {
    return EXCLUDED_DIRS.has(name);
}

async function collectFiles(roots) {
    const out = [];
    const stack = roots.map((entry) => path.resolve(entry));
    while (stack.length) {
        const current = stack.pop();
        const stats = await fs.stat(current);
        if (stats.isDirectory()) {
            const entries = await fs.readdir(current, { withFileTypes: true });
            for (const entry of entries) {
                if (isExcludedDir(entry.name)) continue;
                stack.push(path.join(current, entry.name));
            }
            continue;
        }

        if (stats.isFile() && JS_EXTS.has(path.extname(current))) out.push(current);
    }
    return out;
}

function scanForInlineShaders(filePath, source) {
    const raw = String(source);
    const found = [];
    SHADER_ASSIGN_RE.lastIndex = 0;

    let match = SHADER_ASSIGN_RE.exec(raw);
    while (match) {
        const shaderText = match[2] ?? '';
        if (!SHADER_MARKERS.test(shaderText)) {
            match = SHADER_ASSIGN_RE.exec(raw);
            continue;
        }

        const pre = raw.slice(0, match.index);
        const line = pre.split('\n').length;
        const snippet = shaderText
            .replace(/\s+/g, ' ')
            .slice(0, 140)
            .trim();

        found.push({
            file: filePath,
            line,
            property: match[1],
            snippet
        });
        match = SHADER_ASSIGN_RE.exec(raw);
    }
    return found;
}

async function main() {
    const files = await collectFiles(opts.roots);
    const findings = [];

    for (const file of files) {
        const source = await fs.readFile(file, 'utf8');
        const findingsInFile = scanForInlineShaders(file, source);
        findings.push(...findingsInFile);
    }

    if (!findings.length) {
        if (!opts.json) process.stdout.write('shader-policy: no inline shader assignments found.\n');
        process.exit(0);
    }

    if (opts.json) {
        process.stdout.write(JSON.stringify({
            success: false,
            count: findings.length,
            findings
        }, null, 2));
        process.exit(1);
    }

    process.stdout.write(`shader-policy: found ${findings.length} inline shader assignment(s)\n`);
    for (const item of findings) {
        process.stdout.write(`${item.file}:${item.line} ${item.property}\n`);
        process.stdout.write(`  ${item.snippet}\n`);
    }
    process.exit(1);
}

await main();
