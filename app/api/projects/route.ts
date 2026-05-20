import { ensureDefaultCapabilities, prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  await ensureDefaultCapabilities();
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: { scenes: true, assets: true, jobs: true }
  });
  return Response.json({ projects });
}

export async function POST(request: Request) {
  await ensureDefaultCapabilities();
  const body = await request.json().catch(() => ({}));
  const project = await prisma.project.create({
    data: {
      name: body.name || "Untitled Project",
      description: body.description || "",
      platform: body.platform || "pixverse",
      language: body.language || "English",
      aspectRatio: body.aspectRatio || "16:9",
      style: body.style || "cinematic",
      duration: Number(body.duration || 5)
    }
  });
  await prisma.scene.create({
    data: {
      projectId: project.id,
      title: "Scene 1",
      description: "",
      platform: project.platform,
      language: project.language,
      aspectRatio: project.aspectRatio,
      style: project.style,
      duration: project.duration
    }
  });
  const projectWithRelations = await prisma.project.findUniqueOrThrow({
    where: { id: project.id },
    include: { scenes: true, assets: true, jobs: true }
  });
  return Response.json({ project: projectWithRelations }, { status: 201 });
}
