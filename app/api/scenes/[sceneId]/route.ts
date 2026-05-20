import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ sceneId: string }> }) {
  const { sceneId } = await params;
  const body = await request.json();
  const scene = await prisma.scene.update({
    where: { id: sceneId },
    data: {
      title: body.title,
      description: body.description,
      platform: body.platform,
      language: body.language,
      aspectRatio: body.aspectRatio,
      style: body.style,
      duration: body.duration === undefined ? undefined : Number(body.duration),
      promptReviewed: false
    }
  });
  return Response.json({ scene });
}
