import { mkdir, readFile, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { assertUnderStorage, storageRoot, storageRelativePath } from "@/lib/storage/files";
import {
  getVideoMetadata,
  runVideoCleanupJob,
  VideoCleanupError,
  type VideoCleanupMode,
  type ProPainterQuality,
  type VideoCleanupRegion,
  type VideoMetadata
} from "@/lib/video/ffmpeg";

const allowedVideoExtensions = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);
const maxUploadBytes = Number(process.env.VIDEO_CLEANUP_MAX_UPLOAD_BYTES || 500 * 1024 * 1024);
const videoMimeByExtension: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo"
};

export type UploadedVideoRecord = {
  id: string;
  originalFileName: string;
  filename: string;
  mime: string;
  size: number;
  path: string;
  metadata: VideoMetadata;
  sha256: string;
  createdAt: string;
};

export type CleanupOutputRecord = {
  id: string;
  uploadedVideoId: string;
  originalFileName: string;
  filename: string;
  mime: string;
  size: number;
  path: string;
  mode: VideoCleanupMode;
  region: VideoCleanupRegion;
  metadata: VideoMetadata;
  inputSha256: string;
  outputSha256: string;
  hashesDifferent: boolean;
  ffmpegFilter: string;
  engine: "FFmpeg" | "ProPainter";
  quality?: ProPainterQuality;
  maskPath?: string;
  createdAt: string;
};

export type LocalCleanupJobRecord = {
  id: string;
  uploadedVideoId: string;
  outputId?: string;
  mode: VideoCleanupMode;
  region: VideoCleanupRegion;
  status: "queued" | "running" | "success" | "failed";
  errorMessage?: string;
  outputPath?: string;
  createdAt: string;
  updatedAt: string;
};

function safeSegment(value: string, label: string) {
  if (!value || !/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new VideoCleanupError("VALIDATION_ERROR", `Invalid ${label}.`);
  }
  return value;
}

function safeFileName(name: string) {
  const clean = name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  return clean.slice(0, 120) || "video.mp4";
}

function cleanupRoot() {
  return assertUnderStorage(path.join(storageRoot(), "video-cleanup"));
}

function uploadsDir() {
  return assertUnderStorage(path.join(cleanupRoot(), "uploads"));
}

function outputsDir() {
  return assertUnderStorage(path.join(cleanupRoot(), "outputs"));
}

function jobsDir() {
  return assertUnderStorage(path.join(cleanupRoot(), "jobs"));
}

async function ensureCleanupDirs() {
  await mkdir(uploadsDir(), { recursive: true });
  await mkdir(outputsDir(), { recursive: true });
  await mkdir(jobsDir(), { recursive: true });
}

function uploadRecordPath(id: string) {
  return assertUnderStorage(path.join(uploadsDir(), `${safeSegment(id, "uploadedVideoId")}.json`));
}

function outputRecordPath(id: string) {
  return assertUnderStorage(path.join(outputsDir(), `${safeSegment(id, "outputId")}.json`));
}

function jobRecordPath(id: string) {
  return assertUnderStorage(path.join(jobsDir(), `${safeSegment(id, "jobId")}.json`));
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(assertUnderStorage(filePath), `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson<T>(filePath: string): Promise<T> {
  try {
    return JSON.parse(await readFile(assertUnderStorage(filePath), "utf8")) as T;
  } catch {
    throw new VideoCleanupError("INPUT_NOT_FOUND", "Requested video cleanup file was not found.");
  }
}

async function assertNonEmptyFile(filePath: string) {
  const info = await stat(assertUnderStorage(filePath));
  if (!info.isFile() || info.size <= 0) {
    throw new VideoCleanupError("PROCESSING_FAILED", "Output file is missing or empty.");
  }
  return info.size;
}

async function sha256File(filePath: string) {
  const buffer = await readFile(assertUnderStorage(filePath));
  return createHash("sha256").update(buffer).digest("hex");
}

function ensureVideoLike(file: File) {
  if (!file || file.size <= 0) {
    throw new VideoCleanupError("UPLOAD_FAILED", "Upload a non-empty video file.");
  }
  if (Number.isFinite(maxUploadBytes) && maxUploadBytes > 0 && file.size > maxUploadBytes) {
    throw new VideoCleanupError("UPLOAD_FAILED", `Video file is too large. Max upload size is ${formatBytes(maxUploadBytes)}.`);
  }

  const submittedExtension = path.extname(file.name).toLowerCase();
  const supportedExtension = allowedVideoExtensions.has(submittedExtension);
  const videoMime = file.type.startsWith("video/");
  if (!supportedExtension && !videoMime) {
    throw new VideoCleanupError(
      "UPLOAD_FAILED",
      "Upload a video file with a supported type or extension: mp4, mov, webm, m4v, mkv, or avi."
    );
  }
  const extension = supportedExtension ? submittedExtension : extensionForMime(file.type);
  return {
    extension,
    mime: videoMimeByExtension[extension] || (videoMime ? file.type : "video/mp4")
  };
}

function extensionForMime(mime: string) {
  const found = Object.entries(videoMimeByExtension).find(([, value]) => value === mime);
  return found?.[0] || ".mp4";
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${Math.round(size / 1024 / 1024)} MB`;
}

export function uploadedVideoUrl(id: string) {
  return `/api/video-cleanup/file/${encodeURIComponent(id)}`;
}

export function cleanupOutputUrl(id: string) {
  return `/api/video-cleanup/output/${encodeURIComponent(id)}?v=${encodeURIComponent(id)}`;
}

export function cleanupDownloadUrl(id: string) {
  return `/api/video-cleanup/download/${encodeURIComponent(id)}`;
}

export async function saveUploadedCleanupVideo(file: File) {
  await ensureCleanupDirs();
  const { extension, mime } = ensureVideoLike(file);
  const id = randomUUID();
  const originalFileName = safeFileName(file.name);
  const filename = `${id}${extension}`;
  const filePath = assertUnderStorage(path.join(uploadsDir(), filename));
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  let metadata: VideoMetadata;
  try {
    metadata = await getVideoMetadata(filePath);
  } catch (error) {
    await unlink(filePath).catch(() => undefined);
    throw error;
  }
  const record: UploadedVideoRecord = {
    id,
    originalFileName,
    filename,
    mime,
    size: buffer.length,
    path: filePath,
    metadata,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    createdAt: new Date().toISOString()
  };
  await writeJson(uploadRecordPath(id), record);

  return {
    record,
    previewUrl: uploadedVideoUrl(id)
  };
}

export async function getUploadedCleanupVideo(id: string) {
  const record = await readJson<UploadedVideoRecord>(uploadRecordPath(id));
  await assertNonEmptyFile(record.path);
  return record;
}

export async function getCleanupOutput(id: string) {
  const record = await readJson<CleanupOutputRecord>(outputRecordPath(id));
  await assertNonEmptyFile(record.path);
  return record;
}

export async function getCleanupFile(id: string) {
  try {
    const upload = await getUploadedCleanupVideo(id);
    return {
      path: upload.path,
      mime: upload.mime || "video/mp4",
      filename: upload.originalFileName
    };
  } catch (error) {
    if (!(error instanceof VideoCleanupError) || error.code !== "INPUT_NOT_FOUND") throw error;
  }

  const output = await getCleanupOutput(id);
  return {
    path: output.path,
    mime: output.mime || "video/mp4",
    filename: output.originalFileName
  };
}

export async function runUploadedVideoCleanup({
  uploadedVideoId,
  mode,
  region,
  coverColor,
  quality
}: {
  uploadedVideoId: string;
  mode: VideoCleanupMode;
  region: VideoCleanupRegion;
  coverColor?: string;
  quality?: ProPainterQuality;
}) {
  await ensureCleanupDirs();
  const uploaded = await getUploadedCleanupVideo(uploadedVideoId);
  const jobId = randomUUID();
  const outputId = randomUUID();
  const now = new Date().toISOString();
  const job: LocalCleanupJobRecord = {
    id: jobId,
    uploadedVideoId,
    mode,
    region,
    status: "queued",
    createdAt: now,
    updatedAt: now
  };
  await writeJson(jobRecordPath(jobId), job);

  const outputPath = assertUnderStorage(path.join(outputsDir(), `${outputId}-${mode}.mp4`));
  try {
    await writeJson(jobRecordPath(jobId), {
      ...job,
      status: "running",
      outputPath: storageRelativePath(outputPath),
      updatedAt: new Date().toISOString()
    } satisfies LocalCleanupJobRecord);

    const inputSha256 = uploaded.sha256 || (await sha256File(uploaded.path));
    const result = await runVideoCleanupJob({
      input: uploaded.path,
      output: outputPath,
      mode,
      x: region.x,
      y: region.y,
      w: region.w,
      h: region.h,
      coverColor,
      quality
    });

    const size = await assertNonEmptyFile(outputPath);
    const outputSha256 = await sha256File(outputPath);
    if ((mode === "preview" || mode === "cover") && inputSha256 === outputSha256) {
      throw new VideoCleanupError("PROCESSING_FAILED", `${mode} output matched the input video hash.`);
    }
    const outputRecord: CleanupOutputRecord = {
      id: outputId,
      uploadedVideoId,
      originalFileName: `${mode}-${uploaded.originalFileName.replace(/\.[^.]+$/, "")}.mp4`,
      filename: `${outputId}-${mode}.mp4`,
      mime: "video/mp4",
      size,
      path: outputPath,
      mode,
      region,
      metadata: result.video || uploaded.metadata,
      inputSha256,
      outputSha256,
      hashesDifferent: inputSha256 !== outputSha256,
      ffmpegFilter: result.filter,
      engine: result.engine,
      quality: result.quality,
      maskPath: result.maskPath ? storageRelativePath(result.maskPath) : undefined,
      createdAt: new Date().toISOString()
    };
    await writeJson(outputRecordPath(outputId), outputRecord);
    await writeJson(jobRecordPath(jobId), {
      ...job,
      outputId,
      status: "success",
      outputPath: storageRelativePath(outputPath),
      updatedAt: new Date().toISOString()
    } satisfies LocalCleanupJobRecord);

    return {
      jobId,
      output: outputRecord,
      result
    };
  } catch (error) {
    await writeJson(jobRecordPath(jobId), {
      ...job,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Processing failed.",
      outputPath: storageRelativePath(outputPath),
      updatedAt: new Date().toISOString()
    } satisfies LocalCleanupJobRecord);
    throw error;
  }
}
