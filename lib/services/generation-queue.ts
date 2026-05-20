export async function enqueueGenerationJob(jobId: string) {
  return { queued: false, mode: "inline_mock", jobId };
}
