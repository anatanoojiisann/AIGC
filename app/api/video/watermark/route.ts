import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { apiErrorMessage, errorJson, okJson } from "@/lib/api-response";
import type { ApiErrorCode } from "@/lib/api-response";
import {
  processWatermarkVideo,
  WatermarkProcessingError,
  type WatermarkMode
} from "@/lib/video/watermark.mjs";

export const runtime = "nodejs";

const allowedModes = new Set(["preview", "crop", "cover", "delogo"]);

function storageRoot() {
  return path.resolve(process.cwd(), process.env.STORAGE_ROOT || "./storage");
}

function assertUnderStorage(candidate: string) {
  const root = storageRoot();
  const resolved = path.resolve(candidate);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path is outside the configured storage root.");
  }
  return resolved;
}

function safeFileName(name: string) {
  const parsed = path.parse(name);
  const base = parsed.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "video";
  const ext = parsed.ext.replace(/[^a-zA-Z0-9.]/g, "").slice(0, 12) || ".mp4";
  return `${base}${ext}`;
}

function numberField(form: FormData, name: string) {
  return Number(form.get(name));
}

function errorStatus(code: string) {
  if (code === "INPUT_NOT_FOUND") return 404;
  if (code === "INVALID_COORDINATES" || code === "VALIDATION_ERROR" || code === "UNSUPPORTED_VIDEO_FORMAT") return 400;
  if (code === "FFMPEG_NOT_FOUND") return 503;
  return 500;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const video = form.get("video");
    if (!(video instanceof File)) {
      return errorJson("VALIDATION_ERROR", "Upload a local video file first.", 400);
    }

    const mode = String(form.get("mode") || "preview").toLowerCase();
    if (!allowedModes.has(mode)) {
      return errorJson("VALIDATION_ERROR", "Mode must be preview, crop, cover, or delogo.", 400);
    }

    const jobId = randomUUID();
    const directory = assertUnderStorage(path.join(storageRoot(), "video-watermark", jobId));
    await mkdir(directory, { recursive: true });

    const inputName = safeFileName(video.name || "input.mp4");
    const inputPath = assertUnderStorage(path.join(directory, `input-${inputName}`));
    const outputPath = assertUnderStorage(path.join(directory, `${mode}-output.mp4`));
    await writeFile(inputPath, Buffer.from(await video.arrayBuffer()));

    const result = await processWatermarkVideo({
      input: inputPath,
      output: outputPath,
      mode: mode as WatermarkMode,
      x: numberField(form, "x"),
      y: numberField(form, "y"),
      w: numberField(form, "w"),
      h: numberField(form, "h")
    });

    return okJson({
      result: {
        outputPath: result.outputPath,
        relativeOutputPath: path.relative(process.cwd(), result.outputPath),
        mode: result.mode,
        region: result.region,
        video: result.video
      }
    });
  } catch (error) {
    if (error instanceof WatermarkProcessingError) {
      return errorJson(error.code as ApiErrorCode, error.message, errorStatus(error.code));
    }
    return errorJson("INTERNAL_ERROR", apiErrorMessage(error), 500);
  }
}
