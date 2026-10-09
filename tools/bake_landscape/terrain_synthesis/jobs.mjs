// Registers the terrain synthesis leaves under the explicit landscape/synthesis parent (never part of production defaults).
// @ts-check
import { reliefStudyJob } from './relief_study/ReliefStudyJob.mjs';

export const synthesisJobs = Object.freeze([reliefStudyJob, {
    id: 'landscape/synthesis', configurationPaths: [], codePaths: ['tools/bake_landscape'],
    description: 'Explicit terrain synthesis studies and publications (AI 596); Node only, excluded from all and from the landscape import parent',
    children: ['landscape/synthesis/relief-study']
}]);
