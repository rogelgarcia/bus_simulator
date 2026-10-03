// Copies only declared planning JSON into isolated landscape browser fixtures.
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { LANDSCAPE_PLANNING_ROLES } from '../../src/app/landscape/LandscapePlanningReferences.js';

export async function copyLandscapePlanningSources(manifest, source, directory) {
    for (const reference of manifest.references.filter(entry => LANDSCAPE_PLANNING_ROLES.includes(entry.role))) {
        const destination = path.join(directory, reference.url);
        await mkdir(path.dirname(destination), { recursive: true });
        await cp(path.join(source, reference.url), destination);
    }
}
