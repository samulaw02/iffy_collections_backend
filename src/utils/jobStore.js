const { randomUUID } = require('crypto');

const jobs = new Map();
const JOB_TTL_MS = 2 * 60 * 60 * 1000; // keep jobs for 2 hours

function createJob(total) {
  const id = randomUUID();
  jobs.set(id, {
    id,
    status: 'processing', // processing | completed | failed
    total,
    created: 0,
    failed: [],
    startedAt: new Date().toISOString(),
    completedAt: null,
  });
  return id;
}

function getJob(id) {
  return jobs.get(id) || null;
}

function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return;
  jobs.set(id, { ...job, ...patch });
}

// Sweep stale jobs every 30 minutes
setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs.entries()) {
    if (new Date(job.startedAt).getTime() < cutoff) jobs.delete(id);
  }
}, 30 * 60 * 1000).unref(); // unref so it doesn't keep the process alive

module.exports = { createJob, getJob, updateJob };
