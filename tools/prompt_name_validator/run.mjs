#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const SUBJECTS = new Set([
    'ROADS',
    'VEHICLES',
    'TRAFFIC',
    'BUILDINGS',
    'WINDOWS',
    'PEDESTRIANS',
    'COLLISION',
    'CITY',
    'MESHES',
    'MATERIAL',
    'PHYSICS',
    'AUDIO',
    'TOOLS',
    'REPORTS',
    'REFACTOR',
    'PROJECTMAINTENANCE',
    'TESTS',
    'DOCUMENTATION',
    'ATMOSPHERE',
    'UI'
]);

const BRANCH_TOKEN_RE = /^[a-z0-9._-]+$/;
const NUMERIC_ID_RE = /^[0-9]+$/;
const TITLE_TOKEN_RE = /^[a-z0-9]+$/;
const ACTIVE_PREFIX = 'AI_';
const INTERACTIVE_ACTIVE_PREFIX = 'AI_i_';
const DONE_PREFIX = 'AI_DONE_';
const INTERACTIVE_DONE_PREFIX = 'AI_i_DONE_';
const ACTIVE_PREFIXES = [INTERACTIVE_ACTIVE_PREFIX, ACTIVE_PREFIX];
const DONE_PREFIXES = [INTERACTIVE_DONE_PREFIX, DONE_PREFIX];
const MD_SUFFIX = '.md';
const DONE_FILE_SUFFIX = '_DONE.md';

const strict = process.argv.includes('--strict');
const cwd = process.cwd();
const promptsDir = path.join(cwd, 'prompts');
const archiveDir = path.join(promptsDir, 'archive');

const errors = [];
const warnings = [];

const stats = {
    activeCompliant: 0,
    completedInPromptsCompliant: 0,
    archiveCompliant: 0,
    archiveLegacy: 0,
    scannedFiles: 0
};

const activeNamespaceIds = new Map();

function toPosix(filePath) {
    return filePath.split(path.sep).join('/');
}

function addError(message) {
    errors.push(message);
}

function addWarning(message) {
    warnings.push(message);
}

function detectModeFromPrefix(prefix) {
    return prefix.startsWith('AI_i_') ? 'interactive' : 'standard';
}

function findMatchingPrefix(fileName, prefixes) {
    for (const prefix of prefixes) {
        if (fileName.startsWith(prefix)) {
            return prefix;
        }
    }
    return null;
}

function listFilesRecursive(dir) {
    const results = [];
    const stack = [dir];
    while (stack.length > 0) {
        const current = stack.pop();
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(fullPath);
                continue;
            }
            if (entry.isFile()) {
                results.push(fullPath);
            }
        }
    }
    return results;
}

function parseBodyTokens(tokens, contextLabel) {
    const candidates = [];
    for (let i = 1; i <= tokens.length - 2; i += 1) {
        const subject = tokens[i];
        const id = tokens[i - 1];
        const titleTokens = tokens.slice(i + 1);
        if (!SUBJECTS.has(subject)) {
            continue;
        }
        if (!NUMERIC_ID_RE.test(id)) {
            continue;
        }
        if (titleTokens.length === 0) {
            continue;
        }
        const titleValid = titleTokens.every((token) => TITLE_TOKEN_RE.test(token));
        if (!titleValid) {
            continue;
        }
        const branchTokens = tokens.slice(0, i - 1);
        const branch = branchTokens.length === 0 ? null : branchTokens.join('_');
        candidates.push({
            branch,
            id,
            subject,
            title: titleTokens.join('_')
        });
    }

    if (candidates.length === 0) {
        return {
            ok: false,
            reason: `${contextLabel} does not match expected prompt naming fields`
        };
    }

    if (candidates.length > 1) {
        return {
            ok: false,
            reason: `${contextLabel} has ambiguous parsing; adjust branch/id/subject/title tokens`
        };
    }

    const parsed = candidates[0];
    if (parsed.branch !== null && !BRANCH_TOKEN_RE.test(parsed.branch)) {
        return {
            ok: false,
            reason: `${contextLabel} has invalid branch token "${parsed.branch}"`
        };
    }

    return {
        ok: true,
        parsed
    };
}

function validateActiveFile(fileName, relPath) {
    if (!fileName.endsWith(MD_SUFFIX)) {
        addError(`${relPath}: prompt must use .md extension`);
        return;
    }

    const donePrefix = findMatchingPrefix(fileName, DONE_PREFIXES);
    if (donePrefix !== null) {
        const parsedDone = parseDoneFile(fileName, relPath, donePrefix);
        if (!parsedDone.ok) {
            addError(`${relPath}: ${parsedDone.reason}`);
            return;
        }
        stats.completedInPromptsCompliant += 1;
        return;
    }

    const activePrefix = findMatchingPrefix(fileName, ACTIVE_PREFIXES);
    if (activePrefix === null) {
        addError(`${relPath}: prompt in prompts/ must start with "AI_", "AI_i_", "AI_DONE_", or "AI_i_DONE_"`);
        return;
    }

    const body = fileName.slice(activePrefix.length, -MD_SUFFIX.length);
    const tokens = body.split('_').filter((token) => token.length > 0);
    const parsedResult = parseBodyTokens(tokens, relPath);
    if (!parsedResult.ok) {
        addError(`${relPath}: ${parsedResult.reason}`);
        return;
    }

    const { branch, id } = parsedResult.parsed;
    const namespace = branch ?? 'main';
    const mode = detectModeFromPrefix(activePrefix);
    const key = `${mode}:${namespace}:${id}`;
    const previous = activeNamespaceIds.get(key);
    if (previous) {
        addError(`${relPath}: duplicate active prompt namespace/id with ${previous} (${key})`);
        return;
    }
    activeNamespaceIds.set(key, relPath);
    stats.activeCompliant += 1;
}

function parseDoneFile(fileName, relPath, donePrefix = null) {
    const resolvedDonePrefix = donePrefix ?? findMatchingPrefix(fileName, DONE_PREFIXES);
    if (resolvedDonePrefix === null || !fileName.endsWith(DONE_FILE_SUFFIX)) {
        return { ok: false, reason: 'missing AI_DONE_/AI_i_DONE_ prefix or _DONE.md suffix' };
    }
    const body = fileName.slice(resolvedDonePrefix.length, -DONE_FILE_SUFFIX.length);
    const tokens = body.split('_').filter((token) => token.length > 0);
    return parseBodyTokens(tokens, relPath);
}

function validateArchiveFile(fileName, relPath) {
    if (!fileName.endsWith(MD_SUFFIX)) {
        addError(`${relPath}: archived prompt must use .md extension`);
        return;
    }

    const donePrefix = findMatchingPrefix(fileName, DONE_PREFIXES);
    const activePrefix = findMatchingPrefix(fileName, ACTIVE_PREFIXES);
    if (activePrefix !== null && donePrefix === null) {
        const asActive = fileName.slice(activePrefix.length, -MD_SUFFIX.length).split('_').filter(Boolean);
        const activeParse = parseBodyTokens(asActive, relPath);
        if (activeParse.ok) {
            addError(`${relPath}: active prompt file is in archive folder; expected prompts/`);
            return;
        }
    }

    const parsedDone = parseDoneFile(fileName, relPath, donePrefix);
    if (parsedDone.ok) {
        stats.archiveCompliant += 1;
        return;
    }

    stats.archiveLegacy += 1;
    addWarning(`${relPath}: legacy archived naming (${parsedDone.reason})`);
}

function checkRootLeftovers() {
    const rootEntries = fs.readdirSync(cwd, { withFileTypes: true });
    for (const entry of rootEntries) {
        if (!entry.isFile()) {
            continue;
        }
        if (!entry.name.startsWith('AI_')) {
            continue;
        }
        if (entry.name === 'AI_PROMPT_INSTRUCTIONS.md') {
            continue;
        }
        addError(`${entry.name}: prompt task file must be moved under prompts/`);
    }

    if (fs.existsSync(path.join(cwd, 'old_prompts'))) {
        addWarning('old_prompts/: legacy root archive folder detected; migrate it to prompts/archive/');
    }
}

function validatePromptsTree() {
    if (!fs.existsSync(promptsDir) || !fs.statSync(promptsDir).isDirectory()) {
        addError('prompts/: missing required directory');
        return;
    }
    if (!fs.existsSync(archiveDir) || !fs.statSync(archiveDir).isDirectory()) {
        addError('prompts/archive/: missing required archive directory');
        return;
    }

    const files = listFilesRecursive(promptsDir);
    stats.scannedFiles = files.length;
    for (const absPath of files) {
        const relPath = toPosix(path.relative(cwd, absPath));
        if (!relPath.startsWith('prompts/')) {
            continue;
        }

        if (relPath.startsWith('prompts/archive/')) {
            const remainder = relPath.slice('prompts/archive/'.length);
            if (remainder.includes('/')) {
                addError(`${relPath}: nested subdirectories are not allowed under prompts/archive/`);
                continue;
            }
            validateArchiveFile(path.basename(absPath), relPath);
            continue;
        }

        const remainder = relPath.slice('prompts/'.length);
        if (remainder.includes('/')) {
            addError(`${relPath}: nested subdirectories are not allowed under prompts/`);
            continue;
        }
        validateActiveFile(path.basename(absPath), relPath);
    }
}

checkRootLeftovers();
validatePromptsTree();

if (warnings.length > 0) {
    console.log(`Warnings (${warnings.length}):`);
    for (const warning of warnings) {
        console.log(`- ${warning}`);
    }
}

if (errors.length > 0 || (strict && warnings.length > 0)) {
    if (errors.length > 0) {
        console.error(`Errors (${errors.length}):`);
        for (const error of errors) {
            console.error(`- ${error}`);
        }
    }
    if (strict && warnings.length > 0) {
        console.error(`Strict mode: failing due to warnings (${warnings.length})`);
    }
    process.exit(1);
}

console.log('Prompt validation passed.');
console.log(`Scanned files: ${stats.scannedFiles}`);
console.log(`Compliant active prompts: ${stats.activeCompliant}`);
console.log(`Compliant completed prompts in prompts/: ${stats.completedInPromptsCompliant}`);
console.log(`Compliant archived prompts: ${stats.archiveCompliant}`);
console.log(`Legacy archived prompts (warn-only): ${stats.archiveLegacy}`);
