// Declares lighting children; orchestration remains domain-independent.
// @ts-check
import { sourceJob } from './source/job.mjs';
import { shadowJobs } from './shadows/jobs.mjs';
import { receiverJobs } from './illumination/ReceiverJobs.mjs';
import { previewReferenceJob } from './illumination/PreviewReference.mjs';
import { receiverReprocessJob } from './illumination/reprocess/job.mjs';
import { diffuseProbeJobs } from './diffuse_probes/jobs.mjs';
import { lightingExperimentJobs } from './experiments/lighting_configurations/jobs.mjs';
import { sunSkyJobs } from './experiments/sun_sky_ratios/jobs.mjs';
export const lightingJobs = [sourceJob, ...shadowJobs, ...receiverJobs(true), ...receiverJobs(false), previewReferenceJob, receiverReprocessJob, ...diffuseProbeJobs, ...lightingExperimentJobs, ...sunSkyJobs, {
    id: 'lighting', description: 'Shadows, sky occlusion, surface illumination and vehicle diffuse probes',
    children: ['lighting/preview-reference', 'lighting/shadows', 'lighting/illumination', 'lighting/diffuse-probes']
}];
