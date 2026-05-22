import { cleanupErrorResponse } from "../../_shared";
import { getCleanupFile } from "@/lib/video-cleanup/local-store";
import { serveVideoFile } from "@/lib/video/serve";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ uploadedVideoId: string }> }) {
  try {
    const { uploadedVideoId } = await params;
    const file = await getCleanupFile(uploadedVideoId);
    return serveVideoFile(request, {
      path: file.path,
      mime: file.mime,
      filename: file.filename
    });
  } catch (error) {
    return cleanupErrorResponse(error);
  }
}

export async function HEAD(request: Request, context: { params: Promise<{ uploadedVideoId: string }> }) {
  return GET(request, context);
}
