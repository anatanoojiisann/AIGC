import { prisma } from "@/lib/db";
import { Provider } from "@/lib/adapters/types";
import { GenerationJobManager } from "@/lib/services/generation-job-manager";
import { apiErrorMessage, errorJson, isDatabaseError, okJson } from "@/lib/api-response";

export const runtime = "nodejs";

export async function GET() {
  try {
    const jobs = await prisma.generationJob.findMany({
      orderBy: { createdAt: "desc" },
      include: { project: true, scene: true },
      take: 100
    });
    return okJson({ jobs });
  } catch (error) {
    const code = isDatabaseError(error) ? "DATABASE_ERROR" : "INTERNAL_ERROR";
    const message = isDatabaseError(error)
      ? `${apiErrorMessage(error)} Run npx prisma generate and npx prisma migrate dev, then restart npm run dev.`
      : apiErrorMessage(error);
    return errorJson(code, message, 503);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const job = await new GenerationJobManager().createAndRun({
      sceneId: body.sceneId,
      provider: (body.provider || "official_pixverse") as Provider,
      capabilityId: body.capabilityId || null
    });
    return okJson({ job }, { status: 201 });
  } catch (error) {
    return errorJson("BAD_REQUEST", apiErrorMessage(error), 400);
  }
}
