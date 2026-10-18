// Creates only the two ignored Blender junctions, with real data owned by the main checkout.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const apply = process.argv.includes('--apply');
const names = ['blender_files', 'blender_inputs'];
const git = (root, args) => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, ...args], { encoding: 'utf8' }).trim();
const listing = git(process.cwd(), ['worktree', 'list', '--porcelain']);
const checkouts = listing.split('\n\n').filter(Boolean).map(block => {
    const lines = block.split('\n');
    return { root: lines.find(line => line.startsWith('worktree ')).slice(9), main: lines.includes('branch refs/heads/main') };
});
const main = checkouts.find(checkout => checkout.main);
if (!main) throw new Error('The main branch must have an existing checkout.');
const plans = [];
for (const name of names) {
    const source = path.resolve(main.root, name);
    const sourceStat = fs.lstatSync(source);
    if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) throw new Error(`Main data must be a real folder: ${source}`);
    for (const checkout of checkouts) {
        if (git(checkout.root, ['ls-files', '--', name])) throw new Error(`Tracked files under ${checkout.root}/${name}; refusing junction setup.`);
        if (checkout.main) continue;
        const destination = path.resolve(checkout.root, name);
        if (path.dirname(destination).toLowerCase() !== path.resolve(checkout.root).toLowerCase()) throw new Error('A junction must stand at the checkout root.');
        let exists = false;
        try {
            const stat = fs.lstatSync(destination);
            if (!stat.isSymbolicLink() || fs.realpathSync(destination).toLowerCase() !== fs.realpathSync(source).toLowerCase()) {
                throw new Error(`Existing path must be preserved; expected a junction to ${source}: ${destination}`);
            }
            exists = true;
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
        plans.push({ source, destination, exists });
    }
}
for (const plan of plans) {
    if (apply && !plan.exists) fs.symlinkSync(plan.source, plan.destination, 'junction');
    console.log(`${plan.exists ? 'Existing' : apply ? 'Created' : 'Planned'}: ${plan.destination} -> ${plan.source}`);
}
