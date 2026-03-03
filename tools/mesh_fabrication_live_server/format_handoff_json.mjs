#!/usr/bin/env node
// Format mesh fabrication handoff JSON with deterministic pretty-printing:
// - two-space indentation
// - inline "small arrays" on one line (for example vec3 transforms)

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_FILE = 'assets/public/mesh_fabrication/handoff/mesh.live.v1.json';
const DEFAULT_MAX_INLINE_ITEMS = 8;
const DEFAULT_MAX_INLINE_CHARS = 88;

function printUsage() {
    console.log([
        'Usage:',
        '  node tools/mesh_fabrication_live_server/format_handoff_json.mjs [--file <path>] [--check]',
        '',
        'Options:',
        `  --file <path>             Target JSON file (default: ${DEFAULT_FILE})`,
        `  --max-inline-items <n>    Max primitive-array items to inline (default: ${DEFAULT_MAX_INLINE_ITEMS})`,
        `  --max-inline-chars <n>    Max rendered chars for an inline array (default: ${DEFAULT_MAX_INLINE_CHARS})`,
        '  --check                   Exit with non-zero if formatting changes are needed',
        '  -h, --help                Show this help'
    ].join('\n'));
}

function parsePositiveInteger(raw, label, fallback) {
    if (raw === undefined || raw === null || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(`${label} must be a positive integer.`);
    }
    return value;
}

function parseArgs(argv) {
    const out = {
        file: DEFAULT_FILE,
        check: false,
        maxInlineItems: DEFAULT_MAX_INLINE_ITEMS,
        maxInlineChars: DEFAULT_MAX_INLINE_CHARS
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = String(argv[i] ?? '').trim();
        if (!arg) continue;

        if (arg === '-h' || arg === '--help') {
            out.help = true;
            continue;
        }
        if (arg === '--check') {
            out.check = true;
            continue;
        }
        if (arg === '--file') {
            out.file = String(argv[++i] ?? '').trim();
            continue;
        }
        if (arg === '--max-inline-items') {
            out.maxInlineItems = parsePositiveInteger(argv[++i], '--max-inline-items', out.maxInlineItems);
            continue;
        }
        if (arg === '--max-inline-chars') {
            out.maxInlineChars = parsePositiveInteger(argv[++i], '--max-inline-chars', out.maxInlineChars);
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }

    if (!out.file) {
        throw new Error('--file must be a non-empty path.');
    }
    return out;
}

function isPrimitive(value) {
    return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function encodePrimitive(value) {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? 'null' : encoded;
}

function shouldInlineArray(arr, opts) {
    if (!Array.isArray(arr)) return false;
    if (arr.length < 1) return true;
    if (arr.length > opts.maxInlineItems) return false;

    let chars = 2; // []
    for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        if (!isPrimitive(item)) return false;
        const encoded = encodePrimitive(item);
        chars += encoded.length;
        if (i > 0) chars += 2; // ", "
        if (chars > opts.maxInlineChars) return false;
    }
    return true;
}

function stringifyValue(value, indent, opts) {
    if (isPrimitive(value)) return encodePrimitive(value);

    if (Array.isArray(value)) {
        if (shouldInlineArray(value, opts)) {
            return `[${value.map((item) => encodePrimitive(item)).join(', ')}]`;
        }
        if (value.length < 1) return '[]';

        const childIndent = `${indent}  `;
        const lines = value.map((entry) => `${childIndent}${stringifyValue(entry, childIndent, opts)}`);
        return `[\n${lines.join(',\n')}\n${indent}]`;
    }

    if (value && typeof value === 'object') {
        const entries = Object.entries(value).filter(([, v]) => v !== undefined);
        if (entries.length < 1) return '{}';

        const childIndent = `${indent}  `;
        const lines = entries.map(([key, entryValue]) => {
            return `${childIndent}${JSON.stringify(key)}: ${stringifyValue(entryValue, childIndent, opts)}`;
        });
        return `{\n${lines.join(',\n')}\n${indent}}`;
    }

    return 'null';
}

function formatJson(value, opts) {
    return `${stringifyValue(value, '', opts)}\n`;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printUsage();
        return;
    }

    const absoluteFile = path.resolve(args.file);
    const src = await readFile(absoluteFile, 'utf8');
    let parsed = null;
    try {
        parsed = JSON.parse(src);
    } catch (err) {
        throw new Error(`Invalid JSON at ${absoluteFile}: ${err?.message ?? String(err)}`);
    }

    const formatted = formatJson(parsed, {
        maxInlineItems: args.maxInlineItems,
        maxInlineChars: args.maxInlineChars
    });

    if (src === formatted) {
        console.log(`[MeshHandoffFormat] Already formatted: ${absoluteFile}`);
        return;
    }

    if (args.check) {
        console.error(`[MeshHandoffFormat] Formatting changes needed: ${absoluteFile}`);
        process.exitCode = 1;
        return;
    }

    await writeFile(absoluteFile, formatted, 'utf8');
    console.log(`[MeshHandoffFormat] Wrote formatted JSON: ${absoluteFile}`);
}

main().catch((err) => {
    console.error(`[MeshHandoffFormat] ${err?.message ?? String(err)}`);
    process.exitCode = 1;
});

