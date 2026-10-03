// Registers domain-owned bake trees; adding a domain does not change traversal.
import { lightingJobs } from '../bake_lighting/jobs.mjs';
import { materialJobs } from '../bake_materials/jobs.mjs';
import { visibilityJob } from '../bake_visibility/job.mjs';
import { vegetationJobs } from '../bake_vegetation/jobs.mjs';
import { landscapeJobs } from '../bake_landscape/jobs.mjs';

export const bakeJobs = Object.freeze([...lightingJobs, ...materialJobs, ...vegetationJobs, visibilityJob, ...landscapeJobs, {
    id: 'all', description: 'All currently configured production bake families', children: ['materials', 'lighting', 'visibility']
}]);
