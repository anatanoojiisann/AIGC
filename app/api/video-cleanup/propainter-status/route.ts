import { errorJson, okJson } from "@/lib/api-response";
import { checkPropainterAvailability } from "@/lib/video/ffmpeg";

export const runtime = "nodejs";

export async function GET() {
  try {
    return okJson(await checkPropainterAvailability());
  } catch {
    return errorJson("INTERNAL_ERROR", "Could not check optional ProPainter setup.", 500);
  }
}
