import { prisma } from "@/lib/db";

type PromptInput = {
  sceneId: string;
  description: string;
  platform: string;
  language: string;
  aspectRatio: string;
  style: string;
  duration: number;
};

export class PromptGenerationService {
  async generate(input: PromptInput) {
    const scene = await prisma.scene.findUnique({
      where: { id: input.sceneId },
      include: { assets: true, promptVersions: { orderBy: { version: "desc" }, take: 1 } }
    });

    if (!scene) throw new Error("Scene not found.");

    const referenceSummary =
      scene.assets.length > 0
        ? scene.assets.map((asset) => `${asset.role}: ${asset.originalName} (${asset.mime})`).join("; ")
        : "No reference image uploaded yet.";

    const base = [
      `Scene: ${input.description}`,
      `Platform: ${input.platform}`,
      `Language: ${input.language}`,
      `Aspect ratio: ${input.aspectRatio}`,
      `Style: ${input.style}`,
      `Duration: ${input.duration}s`,
      `Reference assets: ${referenceSummary}`
    ].join("\n");

    const imagePrompt = [
      `Create a ${input.style} reference image for ${input.platform}.`,
      input.description,
      `Composition should fit ${input.aspectRatio}, use clear subject separation, readable silhouettes, production-quality lighting, and visual continuity with the uploaded references.`
    ].join(" ");

    const negativePrompt = [
      "low resolution, blurry, warped anatomy, extra limbs, duplicated face, distorted hands, unreadable text, watermark, logo artifacts, overexposed highlights, underexposed subject, flicker, jitter, inconsistent identity"
    ].join(", ");

    const videoReferenceImagePrompt = [
      `Generate a clean first-frame image for a ${input.duration}-second ${input.aspectRatio} video.`,
      `Keep the scene ready for motion: ${input.description}`,
      `Preserve reference identity, materials, colors, and environment cues.`
    ].join(" ");

    const pixverseVideoPrompt = [
      `${input.language} PixVerse prompt:`,
      `${input.description}`,
      `Maintain ${input.style} visual language, coherent subject identity, stable lighting, and smooth continuity from the reference image.`
    ].join(" ");

    const motionCameraActionPrompt = [
      `Motion: natural subject movement with controlled pacing over ${input.duration} seconds.`,
      "Camera: stable cinematic move, gentle parallax, no abrupt zooms unless described.",
      "Action: emphasize the main scene action while keeping background motion believable and restrained."
    ].join(" ");

    const latest = scene.promptVersions[0]?.version ?? 0;
    const promptVersion = await prisma.promptVersion.create({
      data: {
        sceneId: input.sceneId,
        version: latest + 1,
        imagePrompt,
        negativePrompt,
        videoReferenceImagePrompt,
        pixverseVideoPrompt,
        motionCameraActionPrompt,
        sourceMetadata: JSON.stringify({ base, referenceSummary, generatedBy: "local_template_mvp" })
      }
    });

    await prisma.scene.update({
      where: { id: input.sceneId },
      data: {
        currentPromptVersionId: promptVersion.id,
        promptReviewed: false
      }
    });

    return promptVersion;
  }
}
