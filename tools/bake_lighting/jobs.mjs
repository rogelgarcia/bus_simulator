// Declares lighting children; orchestration remains domain-independent.
// @ts-check
import { sourceJob } from './source/job.mjs';
import { shadowJobs } from './shadows/jobs.mjs';
import { receiverJobs } from './illumination/ReceiverJobs.mjs';
import { previewReferenceJob } from './illumination/PreviewReference.mjs';
import { receiverReprocessJob } from './illumination/reprocess/job.mjs';
export const lightingJobs = [sourceJob, ...shadowJobs, ...receiverJobs(true), ...receiverJobs(false), previewReferenceJob, receiverReprocessJob, {
    id: 'lighting', description: 'Shadows, sky occlusion, enhanced and original illumination packages',
    children: ['lighting/preview-reference', 'lighting/shadows', 'lighting/illumination']
}];
