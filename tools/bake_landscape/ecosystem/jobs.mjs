// Registers the AI 599 ecosystem bake leaves: the committed blue-noise table check and the offline layer generation that depends on it.
// @ts-check
import { blueNoiseJob } from './blue_noise/BlueNoiseJob.mjs';
import { ecosystemJob } from './EcosystemJob.mjs';

export const ecosystemJobs = Object.freeze([blueNoiseJob, ecosystemJob]);
