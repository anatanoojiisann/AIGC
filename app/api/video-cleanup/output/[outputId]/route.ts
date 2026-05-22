import { cleanupErrorResponse } from "../../_shared";
import { getCleanupOutput } from "@/lib/video-cleanup/local-store";
import { serveVideoFile } from "@/lib/video/serve";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ outputId: string }> }) {
  try {
    const { outputId } = await params;
    const output = await getCleanupOutput(outputId);
    return serveVideoFile(request, {
      path: output.path,
      mime: output.mime,
      filename: output.originalFileName
    });
  } catch (error) {
    return cleanupErrorResponse(error);
  }
}

export async function HEAD(request: Request, context: { params: Promise<{ outputId: string }> }) {
  return GET(request, context);
}
