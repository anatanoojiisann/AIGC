import { okJson } from "@/lib/api-response";
import { cleanupErrorResponse, runAssetCleanup } from "../_shared";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const data = await runAssetCleanup(body, "preview");
    return okJson(data);
  } catch (error) {
    return cleanupErrorResponse(error);
  }
}
