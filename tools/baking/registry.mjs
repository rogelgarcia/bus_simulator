// Registers domain-owned bake trees; adding a domain does not change traversal.
import { lightingJobs } from '../bake_lighting/jobs.mjs';
import { materialJobs } from '../bake_materials/jobs.mjs';
import { visibilityJob } from '../bake_visibility/job.mjs';

export const bakeJobs = Object.freeze([...lightingJobs, ...materialJobs, visibilityJob, {
    id: 'all', description: 'All currently configured production bake families', children: ['materials', 'lighting', 'visibility']
}]);
