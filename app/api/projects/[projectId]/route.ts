import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      assets: { orderBy: { createdAt: "desc" } },
      scenes: {
        orderBy: { createdAt: "asc" },
        include: {
          assets: { orderBy: { createdAt: "desc" } },
          promptVersions: { orderBy: { version: "desc" } },
          jobs: { orderBy: { createdAt: "desc" } }
        }
      },
      jobs: { orderBy: { createdAt: "desc" } },
      cleanupJobs: { orderBy: { createdAt: "desc" } }
    }
  });
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  return Response.json({ project });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const body = await request.json();
  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      name: body.name,
      description: body.description,
      platform: body.platform,
      language: body.language,
      aspectRatio: body.aspectRatio,
      style: body.style,
      duration: body.duration === undefined ? undefined : Number(body.duration)
    }
  });
  return Response.json({ project });
}
