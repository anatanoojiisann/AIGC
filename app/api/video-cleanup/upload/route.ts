import { errorJson, okJson } from "@/lib/api-response";
import { saveUploadedCleanupVideo } from "@/lib/video-cleanup/local-store";
import { VideoCleanupError } from "@/lib/video/ffmpeg";
import { cleanupErrorResponse } from "../_shared";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return errorJson("VALIDATION_ERROR", "Upload one video file.", 400);
    }

    const { record, previewUrl } = await saveUploadedCleanupVideo(file);
    return okJson({
      uploadedVideoId: record.id,
      originalFileName: record.originalFileName,
      previewUrl,
      width: record.metadata.width,
      height: record.metadata.height,
      duration: record.metadata.duration
    });
  } catch (error) {
    if (error instanceof VideoCleanupError) return cleanupErrorResponse(error);
    return cleanupErrorResponse(error);
  }
}
