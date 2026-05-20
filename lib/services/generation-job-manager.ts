import { OfficialPixVerseAdapter } from "@/lib/adapters/official-pixverse";
import { ObservedWebApiAdapter } from "@/lib/adapters/observed-web-api";
import { PlaywrightAutomationAdapter } from "@/lib/adapters/playwright-automation";
import { Provider } from "@/lib/adapters/types";
import { ensureDefaultCapabilities, prisma } from "@/lib/db";
import { CapabilityRouter } from "@/lib/services/capability-router";

type CreateJobInput = {
  sceneId: string;
  provider: Provider;
  capabilityId?: string | null;
};

export class GenerationJobManager {
  async createAndRun(input: CreateJobInput) {
    await ensureDefaultCapabilities();

    const scene = await prisma.scene.findUnique({
      where: { id: input.sceneId },
      include: {
        project: true,
        assets: true,
        promptVersions: { orderBy: { version: "desc" }, take: 1 }
      }
    });

    if (!scene) throw new Error("Scene not found.");
    const prompt = scene.promptVersions[0];
    if (!prompt || !prompt.reviewedAt || !scene.promptReviewed) {
      throw new Error("Review and save prompts before submitting a generation job.");
    }

    const provider = await new CapabilityRouter().resolve(input.provider, input.capabilityId);
    if (provider === "manual_required") {
      throw new Error("No allowed provider is available for this request.");
    }

    const request = {
      projectId: scene.projectId,
      sceneId: scene.id,
      capabilityId: input.capabilityId,
      promptVersionId: prompt.id,
      prompt: `${prompt.pixverseVideoPrompt}\n\n${prompt.motionCameraActionPrompt}`,
      negativePrompt: prompt.negativePrompt,
      aspectRatio: scene.aspectRatio,
      duration: scene.duration,
      referenceAssetIds: scene.assets.map((asset) => asset.id)
    };

    const job = await prisma.generationJob.create({
      data: {
        projectId: scene.projectId,
        sceneId: scene.id,
        provider,
        capabilityId: input.capabilityId,
        request: JSON.stringify(request),
        status: "running"
      }
    });

    const payload = { ...request, jobId: job.id };
    const result =
      provider === "official_pixverse"
        ? await new OfficialPixVerseAdapter().imageToVideo(payload)
        : provider === "observed_web_api"
          ? await new ObservedWebApiAdapter().generate(payload)
          : await new PlaywrightAutomationAdapter().generate(payload);

    return prisma.generationJob.update({
      where: { id: job.id },
      data: {
        status: result.status,
        response: JSON.stringify(result.response),
        externalTaskId: result.externalTaskId,
        resultUrl: result.resultUrl,
        error: result.error
      }
    });
  }

  async retry(jobId: string, provider?: Provider) {
    const oldJob = await prisma.generationJob.findUnique({ where: { id: jobId } });
    if (!oldJob) throw new Error("Job not found.");
    await prisma.generationJob.update({
      where: { id: oldJob.id },
      data: { retryCount: oldJob.retryCount + 1 }
    });
    return this.createAndRun({
      sceneId: oldJob.sceneId,
      provider: provider || (oldJob.provider as Provider),
      capabilityId: oldJob.capabilityId
    });
  }
}
