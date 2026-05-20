import { ensureDefaultCapabilities, prisma } from "@/lib/db";
import { apiErrorMessage, errorJson, okJson } from "@/lib/api-response";

export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureDefaultCapabilities();
    const capabilities = await prisma.capability.findMany({ orderBy: [{ provider: "asc" }, { createdAt: "desc" }] });
    return okJson({ capabilities });
  } catch (error) {
    return errorJson("INTERNAL_ERROR", apiErrorMessage(error), 503);
  }
}
