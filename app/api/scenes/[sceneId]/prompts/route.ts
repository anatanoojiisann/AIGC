import { prisma } from "@/lib/db";
import { PromptGenerationService } from "@/lib/services/prompt-generation";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ sceneId: string }> }) {
  const { sceneId } = await params;
  const body = await request.json();
  const prompt = await new PromptGenerationService().generate({
    sceneId,
    description: body.description,
    platform: body.platform,
    language: body.language,
    aspectRatio: body.aspectRatio,
    style: body.style,
    duration: Number(body.duration || 5)
  });
  return Response.json({ prompt }, { status: 201 });
}

export async function PUT(request: Request, { params }: { params: Promise<{ sceneId: string }> }) {
  const { sceneId } = await params;
  const body = await request.json();
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    include: { promptVersions: { orderBy: { version: "desc" }, take: 1 } }
  });
  if (!scene) return Response.json({ error: "Scene not found." }, { status: 404 });
  const latest = scene.promptVersions[0]?.version ?? 0;
  const prompt = await prisma.promptVersion.create({
    data: {
      sceneId,
      version: latest + 1,
      imagePrompt: body.imagePrompt || "",
      negativePrompt: body.negativePrompt || "",
      videoReferenceImagePrompt: body.videoReferenceImagePrompt || "",
      pixverseVideoPrompt: body.pixverseVideoPrompt || "",
      motionCameraActionPrompt: body.motionCameraActionPrompt || "",
      reviewedAt: new Date(),
      sourceMetadata: JSON.stringify({ savedBy: "manual_review", previousPromptVersionId: body.previousPromptVersionId || null })
    }
  });
  await prisma.scene.update({
    where: { id: sceneId },
    data: { currentPromptVersionId: prompt.id, promptReviewed: true }
  });
  return Response.json({ prompt });
}
