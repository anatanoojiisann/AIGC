import { ensureDefaultCapabilities, prisma } from "@/lib/db";
import { apiErrorMessage, errorJson, isDatabaseError, okJson } from "@/lib/api-response";

export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureDefaultCapabilities();
    const capabilities = await prisma.capability.findMany({ orderBy: [{ provider: "asc" }, { createdAt: "desc" }] });
    return okJson({ capabilities });
  } catch (error) {
    const code = isDatabaseError(error) ? "DATABASE_ERROR" : "INTERNAL_ERROR";
    const message = isDatabaseError(error)
      ? `${apiErrorMessage(error)} Run npx prisma generate and npx prisma migrate dev, then restart npm run dev.`
      : apiErrorMessage(error);
    return errorJson(code, message, 503);
  }
}
