import { prisma } from "@/lib/db";
import { Provider } from "@/lib/adapters/types";
import { GenerationJobManager } from "@/lib/services/generation-job-manager";

export const runtime = "nodejs";

export async function GET() {
  const jobs = await prisma.generationJob.findMany({
    orderBy: { createdAt: "desc" },
    include: { project: true, scene: true },
    take: 100
  });
  return Response.json({ jobs });
}

export async function POST(request: Request) {
  const body = await request.json();
  try {
    const job = await new GenerationJobManager().createAndRun({
      sceneId: body.sceneId,
      provider: (body.provider || "official_pixverse") as Provider,
      capabilityId: body.capabilityId || null
    });
    return Response.json({ job }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Job failed." }, { status: 400 });
  }
}
