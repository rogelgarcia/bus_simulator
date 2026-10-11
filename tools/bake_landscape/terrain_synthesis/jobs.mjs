// Registers the terrain synthesis leaves under the explicit landscape/synthesis parent (never part of production defaults).
// @ts-check
import { reliefStudyJob } from './relief_study/ReliefStudyJob.mjs';
import { fixtureJob } from './fixture/FixtureJob.mjs';
import { resolutionStudyJob } from './resolution_study/ResolutionStudyJob.mjs';
import { coastalV3Job } from './coastal_v3/CoastalV3Job.mjs';
import { surroundJob } from './surround/SurroundJob.mjs';

export const synthesisJobs = Object.freeze([reliefStudyJob, fixtureJob, resolutionStudyJob, coastalV3Job, surroundJob, {
    id: 'landscape/synthesis', configurationPaths: [], codePaths: ['tools/bake_landscape'],
    description: 'Explicit terrain synthesis studies, gates and publications (AI 596); Node only, excluded from all and from the landscape import parent',
    children: ['landscape/synthesis/relief-study', 'landscape/synthesis/fixture', 'landscape/synthesis/resolution-study', 'landscape/synthesis/coastal-v3', 'landscape/synthesis/surround']
}]);
