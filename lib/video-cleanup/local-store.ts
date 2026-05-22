import { mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { assertUnderStorage, storageRoot, storageRelativePath } from "@/lib/storage/files";
import {
  getVideoMetadata,
  runVideoCleanupJob,
  VideoCleanupError,
  type VideoCleanupMode,
  type VideoCleanupRegion,
  type VideoMetadata
} from "@/lib/video/ffmpeg";

const allowedVideoExtensions = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);

export type UploadedVideoRecord = {
  id: string;
  originalFileName: string;
  filename: string;
  mime: string;
  size: number;
  path: string;
  metadata: VideoMetadata;
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

function ensureVideoLike(file: File) {
  const extension = path.extname(file.name).toLowerCase();
  if (!file.type.startsWith("video/") && !allowedVideoExtensions.has(extension)) {
    throw new VideoCleanupError("UNSUPPORTED_VIDEO_FORMAT", "Upload a supported video file.");
  }
  return extension || ".mp4";
}

export function uploadedVideoUrl(id: string) {
  return `/api/video-cleanup/file/${encodeURIComponent(id)}`;
}

export function cleanupOutputUrl(id: string) {
  return `/api/video-cleanup/output/${encodeURIComponent(id)}`;
}

export function cleanupDownloadUrl(id: string) {
  return `/api/video-cleanup/download/${encodeURIComponent(id)}`;
}

export async function saveUploadedCleanupVideo(file: File) {
  await ensureCleanupDirs();
  const extension = ensureVideoLike(file);
  const id = randomUUID();
  const originalFileName = safeFileName(file.name);
  const filename = `${id}${extension}`;
  const filePath = assertUnderStorage(path.join(uploadsDir(), filename));
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  const metadata = await getVideoMetadata(filePath);
  const record: UploadedVideoRecord = {
    id,
    originalFileName,
    filename,
    mime: file.type || "video/mp4",
    size: buffer.length,
    path: filePath,
    metadata,
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
  coverColor
}: {
  uploadedVideoId: string;
  mode: VideoCleanupMode;
  region: VideoCleanupRegion;
  coverColor?: string;
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

    const result = await runVideoCleanupJob({
      input: uploaded.path,
      output: outputPath,
      mode,
      x: region.x,
      y: region.y,
      w: region.w,
      h: region.h,
      coverColor
    });

    const size = await assertNonEmptyFile(outputPath);
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
