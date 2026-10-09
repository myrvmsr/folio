import fs from 'node:fs';
import { github } from './github.mjs';
const repository = '/repos/myrvmsr/folio-build';
const run = process.argv[2] ? await github(`${repository}/actions/runs/${process.argv[2]}`)
  : (await github(`${repository}/actions/runs?per_page=1`)).workflow_runs[0];
if (!run) throw new Error('No build run found');
const { jobs } = await github(`${repository}/actions/runs/${run.id}/jobs?per_page=100`);
console.log(JSON.stringify({ run: run.id, sha: run.head_sha, status: run.status, conclusion: run.conclusion, url: run.html_url,
  jobs: jobs.map((job) => ({ id: job.id, name: job.name, status: job.status, conclusion: job.conclusion,
    step: job.steps.find((step) => step.status === 'in_progress')?.name,
    failed: job.steps.filter((step) => step.conclusion === 'failure').map((step) => step.name) })),
}, null, 2));
if (process.argv.includes('--logs')) {
  fs.mkdirSync('.folio-checks/ci-logs', { recursive: true });
  for (const job of jobs.filter((job) => job.conclusion === 'failure')) {
    const logs = await github(`${repository}/actions/jobs/${job.id}/logs`, { raw: true });
    fs.writeFileSync(`.folio-checks/ci-logs/${job.id}.txt`, logs);
    console.log(`${job.name}\n${logs.toString('utf8').slice(-6500)}`);
  }
}
