import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json();
  const project = await prisma.project.findUnique({ where: { id: body.projectId } });
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  const scene = await prisma.scene.create({
    data: {
      projectId: project.id,
      title: body.title || "Scene",
      description: body.description || "",
      platform: body.platform || project.platform,
      language: body.language || project.language,
      aspectRatio: body.aspectRatio || project.aspectRatio,
      style: body.style || project.style,
      duration: Number(body.duration || project.duration)
    },
    include: { assets: true, promptVersions: true, jobs: true }
  });

  return Response.json({ scene }, { status: 201 });
}
