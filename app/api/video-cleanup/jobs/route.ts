import { apiErrorMessage, errorJson, isDatabaseError, okJson } from "@/lib/api-response";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") || undefined;
    const jobs = await prisma.videoCleanupJob.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        sourceAsset: true,
        outputAsset: true
      }
    });
    return okJson({ jobs });
  } catch (error) {
    const code = isDatabaseError(error) ? "DATABASE_ERROR" : "INTERNAL_ERROR";
    const message = isDatabaseError(error)
      ? `${apiErrorMessage(error)} Run npx prisma generate and npx prisma migrate dev.`
      : apiErrorMessage(error);
    return errorJson(code, message, isDatabaseError(error) ? 503 : 500);
  }
}
