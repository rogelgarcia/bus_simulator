// Adds staging and single-material selection to existing deterministic PBR generators.
// @ts-check
import path from 'node:path';

/** @param {string} root @param {string[]} names @param {string[]} [argv] */
export function materialArguments(root, names, argv = process.argv.slice(2)) {
    let output = path.join(root, 'assets/public/pbr'), material = null;
    for (let i = 0; i < argv.length; i += 2) {
        if (!['--output', '--material'].includes(argv[i]) || !argv[i + 1]) throw new Error('Expected --output <directory> or --material <id>');
        if (argv[i] === '--output') output = path.resolve(root, argv[i + 1]);
        else material = argv[i + 1];
    }
    if (material && !names.includes(material)) throw new Error(`Unknown material ${material}; expected ${names.join(', ')}`);
    return Object.freeze({ output, selected: material ? [material] : names });
}
