import { errorJson, okJson } from "@/lib/api-response";
import { saveUploadedCleanupVideo } from "@/lib/video-cleanup/local-store";
import { VideoCleanupError } from "@/lib/video/ffmpeg";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return errorJson("UPLOAD_FAILED", "Upload must use multipart/form-data.", 400);
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return errorJson("UPLOAD_FAILED", "Upload one video file in the file field.", 400);
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
    const message = error instanceof Error ? error.message : "Upload failed.";
    console.error("[video-cleanup/upload] upload failed", {
      message,
      code: error instanceof VideoCleanupError ? error.code : "UPLOAD_FAILED"
    });
    if (error instanceof VideoCleanupError) {
      return errorJson("UPLOAD_FAILED", message, 400);
    }
    return errorJson("UPLOAD_FAILED", message, 500);
  }
}
