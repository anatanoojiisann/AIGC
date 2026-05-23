import { access, mkdir, stat } from "fs/promises";
import { constants as fsConstants } from "fs";
import path from "path";
import { spawn } from "child_process";

export const VIDEO_CLEANUP_MODES = ["preview", "delogo", "blur", "cover", "crop", "ai-inpaint-propainter"] as const;
export const PROPAINTER_QUALITIES = ["fast", "balanced", "high"] as const;

export type VideoCleanupMode = (typeof VIDEO_CLEANUP_MODES)[number];
export type ProPainterQuality = (typeof PROPAINTER_QUALITIES)[number];

export type VideoCleanupRegion = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type VideoMetadata = {
  width: number;
  height: number;
  duration?: number;
};

export type VideoCleanupOptions = VideoCleanupRegion & {
  input: string;
  output: string;
  mode: VideoCleanupMode;
  coverColor?: string;
  dryRun?: boolean;
  quality?: ProPainterQuality;
};

export type VideoCleanupResult = {
  input: string;
  output: string;
  mode: VideoCleanupMode;
  region: VideoCleanupRegion;
  video?: VideoMetadata;
  filter: string;
  command: "ffmpeg" | "propainter";
  args: string[];
  dryRun: boolean;
  engine: "FFmpeg" | "ProPainter";
  quality?: ProPainterQuality;
  maskPath?: string;
};

export type ProPainterAvailability = {
  available: boolean;
  code?: "PROPAINTER_NOT_INSTALLED";
  message?: string;
};

export class VideoCleanupError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "VideoCleanupError";
    this.code = code;
    this.details = details;
  }
}

const supportedExtensions = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);
const propainterUnavailableMessage = "ProPainter is optional and not configured. Use another mode or install ProPainter.";

function commandMissing(command: string) {
  if (command !== "ffmpeg" && command !== "ffprobe") {
    return new VideoCleanupError(
      "PROPAINTER_NOT_INSTALLED",
      propainterUnavailableMessage
    );
  }

  const label = command === "ffprobe" ? "FFprobe" : "FFmpeg";
  return new VideoCleanupError(
    "FFMPEG_NOT_FOUND",
    `${label} is required. Please install FFmpeg and ensure it is available in PATH.`
  );
}

function runCommand(command: string, args: string[], options: { cwd?: string } = {}) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(commandMissing(command));
        return;
      }
      reject(new VideoCleanupError("PROCESSING_FAILED", `${command} could not start: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new VideoCleanupError(
          command === "ffprobe"
            ? "UNSUPPORTED_VIDEO_FORMAT"
            : command === "ffmpeg"
              ? "PROCESSING_FAILED"
              : "PROPAINTER_NOT_INSTALLED",
          command === "ffprobe"
            ? "Unsupported video format or unreadable video stream."
            : command === "ffmpeg"
              ? `FFmpeg processing failed with exit code ${code}.`
              : propainterUnavailableMessage,
          { stderr: stderr.trim() }
        )
      );
    });
  });
}

export async function checkFfmpegAvailable() {
  await runCommand("ffmpeg", ["-version"]);
  await runCommand("ffprobe", ["-version"]);
}

function absolutePath(value: string | undefined, label: string) {
  if (!value || typeof value !== "string" || !value.trim()) {
    throw new VideoCleanupError("VALIDATION_ERROR", `${label} is required.`);
  }
  return path.resolve(process.cwd(), value);
}

function positiveInteger(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new VideoCleanupError("INVALID_COORDINATES", `${label} must be a positive number.`);
  }
  return Math.round(number);
}

function normalizeRegion(options: Pick<VideoCleanupOptions, "x" | "y" | "w" | "h">) {
  return {
    x: positiveInteger(options.x, "x"),
    y: positiveInteger(options.y, "y"),
    w: positiveInteger(options.w, "w"),
    h: positiveInteger(options.h, "h")
  };
}

function normalizeQuality(value: unknown): ProPainterQuality {
  const quality = String(value || "balanced").toLowerCase();
  if (!PROPAINTER_QUALITIES.includes(quality as ProPainterQuality)) {
    throw new VideoCleanupError("VALIDATION_ERROR", "quality must be fast, balanced, or high.");
  }
  return quality as ProPainterQuality;
}

async function assertInputVideo(inputPath: string) {
  try {
    const info = await stat(inputPath);
    if (!info.isFile()) {
      throw new VideoCleanupError("INPUT_NOT_FOUND", "Input video not found.");
    }
  } catch (error) {
    if (error instanceof VideoCleanupError) throw error;
    throw new VideoCleanupError("INPUT_NOT_FOUND", "Input video not found.");
  }

  const extension = path.extname(inputPath).toLowerCase();
  if (!supportedExtensions.has(extension)) {
    throw new VideoCleanupError(
      "UNSUPPORTED_VIDEO_FORMAT",
      `Unsupported video format "${extension || "unknown"}". Use mp4, mov, m4v, webm, mkv, or avi.`
    );
  }
}

export async function getVideoMetadata(inputPath: string): Promise<VideoMetadata> {
  const { stdout } = await runCommand("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height:format=duration",
    "-of",
    "json",
    inputPath
  ]);

  let payload: { streams?: Array<{ width?: number; height?: number }>; format?: { duration?: string } };
  try {
    payload = JSON.parse(stdout);
  } catch {
    throw new VideoCleanupError("UNSUPPORTED_VIDEO_FORMAT", "Could not read video metadata.");
  }

  const stream = payload.streams?.[0];
  const width = Number(stream?.width);
  const height = Number(stream?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new VideoCleanupError("UNSUPPORTED_VIDEO_FORMAT", "No readable video stream was found.");
  }

  const duration = Number(payload.format?.duration);
  return {
    width,
    height,
    ...(Number.isFinite(duration) && duration > 0 ? { duration } : {})
  };
}

function validateRegion(region: VideoCleanupRegion, video: VideoMetadata) {
  if (region.x + region.w > video.width || region.y + region.h > video.height) {
    throw new VideoCleanupError(
      "INVALID_COORDINATES",
      `Selected region must stay inside the video dimensions (${video.width}x${video.height}).`
    );
  }
}

function even(value: number) {
  return Math.max(2, Math.floor(value / 2) * 2);
}

function cropFilter(region: VideoCleanupRegion, video: VideoMetadata) {
  const distances = [
    { edge: "left", value: region.x, limit: Math.max(24, video.width * 0.08) },
    { edge: "right", value: video.width - (region.x + region.w), limit: Math.max(24, video.width * 0.08) },
    { edge: "top", value: region.y, limit: Math.max(24, video.height * 0.08) },
    { edge: "bottom", value: video.height - (region.y + region.h), limit: Math.max(24, video.height * 0.08) }
  ].sort((a, b) => a.value - b.value);

  const nearest = distances[0];
  if (nearest.value > nearest.limit) {
    throw new VideoCleanupError(
      "INVALID_COORDINATES",
      "Crop mode is only for regions near a video edge. Use blur, cover, or delogo for interior regions."
    );
  }

  if (nearest.edge === "left") {
    const x = even(region.x + region.w);
    return `crop=${even(video.width - x)}:${even(video.height)}:${x}:0`;
  }
  if (nearest.edge === "right") {
    return `crop=${even(region.x)}:${even(video.height)}:0:0`;
  }
  if (nearest.edge === "top") {
    const y = even(region.y + region.h);
    return `crop=${even(video.width)}:${even(video.height - y)}:0:${y}`;
  }
  return `crop=${even(video.width)}:${even(region.y)}:0:0`;
}

function safeCoverColor(value?: string) {
  if (!value) return "black@0.85";
  if (!/^[a-zA-Z0-9#@.]+$/.test(value)) {
    throw new VideoCleanupError("VALIDATION_ERROR", "coverColor contains unsupported characters.");
  }
  return value;
}

export function buildVideoCleanupFilter({
  mode,
  region,
  video,
  coverColor
}: {
  mode: VideoCleanupMode;
  region: VideoCleanupRegion;
  video: VideoMetadata;
  coverColor?: string;
}) {
  if (mode === "ai-inpaint-propainter") {
    throw new VideoCleanupError("PROPAINTER_NOT_INSTALLED", propainterUnavailableMessage);
  }

  if (mode === "preview") {
    return {
      type: "vf" as const,
      value: `drawbox=x=${region.x}:y=${region.y}:w=${region.w}:h=${region.h}:color=yellow@0.95:t=8,drawbox=x=${region.x}:y=${region.y}:w=${region.w}:h=${region.h}:color=black@0.75:t=2`
    };
  }

  if (mode === "delogo") {
    return {
      type: "vf" as const,
      value: `delogo=x=${region.x}:y=${region.y}:w=${region.w}:h=${region.h}:show=0`
    };
  }

  if (mode === "cover") {
    return {
      type: "vf" as const,
      value: `drawbox=x=${region.x}:y=${region.y}:w=${region.w}:h=${region.h}:color=${safeCoverColor(
        coverColor
      )}:t=fill`
    };
  }

  if (mode === "crop") {
    return { type: "vf" as const, value: cropFilter(region, video) };
  }

  return {
    type: "filter_complex" as const,
    value: `[0:v]split[base][region];[region]crop=${region.w}:${region.h}:${region.x}:${region.y},boxblur=4:1[blur];[base][blur]overlay=${region.x}:${region.y}[v]`
  };
}

function buildArgs(input: string, output: string, mode: VideoCleanupMode, region: VideoCleanupRegion, video: VideoMetadata, coverColor?: string) {
  const commonVideoArgs = ["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p"];
  const filter = buildVideoCleanupFilter({ mode, region, video, coverColor });

  if (filter.type === "filter_complex") {
    return {
      args: [
        "-y",
        "-i",
        input,
        "-filter_complex",
        filter.value,
        "-map",
        "[v]",
        "-map",
        "0:a?",
        ...commonVideoArgs,
        "-c:a",
        "copy",
        output
      ],
      filter: filter.value
    };
  }

  const args = ["-y", "-i", input];
  if (mode === "preview") args.push("-t", "3");
  args.push("-vf", filter.value, ...commonVideoArgs);
  if (mode === "preview") {
    args.push("-an", output);
  } else {
    args.push("-map", "0:v:0", "-map", "0:a?", "-c:a", "copy", output);
  }
  return { args, filter: filter.value };
}

function propainterNotInstalled() {
  return new VideoCleanupError(
    "PROPAINTER_NOT_INSTALLED",
    propainterUnavailableMessage
  );
}

async function assertDirectory(directory: string) {
  try {
    const info = await stat(directory);
    if (!info.isDirectory()) throw propainterNotInstalled();
  } catch (error) {
    if (error instanceof VideoCleanupError) throw error;
    throw propainterNotInstalled();
  }
}

async function assertExecutable(filePath: string) {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw propainterNotInstalled();
    await access(filePath, fsConstants.X_OK);
  } catch (error) {
    if (error instanceof VideoCleanupError) throw error;
    throw propainterNotInstalled();
  }
}

async function firstExistingFile(candidates: string[]) {
  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      // Try the next common ProPainter entrypoint.
    }
  }
  throw propainterNotInstalled();
}

async function getPropainterEnvironment() {
  if (process.env.PROPAINTER_ENABLED !== "true") {
    throw propainterNotInstalled();
  }

  const repoPath = process.env.PROPAINTER_REPO_PATH?.trim();
  const pythonPath = process.env.PROPAINTER_PYTHON?.trim();
  if (!repoPath || !pythonPath) throw propainterNotInstalled();

  const resolvedRepoPath = path.resolve(process.cwd(), repoPath);
  const resolvedPythonPath = path.resolve(process.cwd(), pythonPath);
  await assertDirectory(resolvedRepoPath);
  await assertExecutable(resolvedPythonPath);
  const script = await firstExistingFile([
    path.join(resolvedRepoPath, "inference_propainter.py"),
    path.join(resolvedRepoPath, "inference", "propainter.py"),
    path.join(resolvedRepoPath, "scripts", "inference_propainter.py")
  ]);

  return { resolvedRepoPath, resolvedPythonPath, script };
}

export async function checkPropainterAvailability(): Promise<ProPainterAvailability> {
  try {
    await getPropainterEnvironment();
    return { available: true };
  } catch (error) {
    if (error instanceof VideoCleanupError && error.code === "PROPAINTER_NOT_INSTALLED") {
      return {
        available: false,
        code: "PROPAINTER_NOT_INSTALLED",
        message: propainterUnavailableMessage
      };
    }
    throw error;
  }
}

async function createPropainterMask(maskPath: string, region: VideoCleanupRegion, video: VideoMetadata) {
  await runCommand("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=black:s=${video.width}x${video.height}`,
    "-frames:v",
    "1",
    "-vf",
    `drawbox=x=${region.x}:y=${region.y}:w=${region.w}:h=${region.h}:color=white:t=fill`,
    maskPath
  ]);
}

async function runPropainterInpaint({
  input,
  output,
  region,
  video,
  quality,
  dryRun
}: {
  input: string;
  output: string;
  region: VideoCleanupRegion;
  video: VideoMetadata;
  quality: ProPainterQuality;
  dryRun: boolean;
}) {
  const { resolvedRepoPath, resolvedPythonPath, script } = await getPropainterEnvironment();

  const maskPath = path.join(path.dirname(output), `${path.basename(output, path.extname(output))}-mask.png`);
  const filter = `propainter-mask=x=${region.x}:y=${region.y}:w=${region.w}:h=${region.h}:quality=${quality}`;
  const args = [
    script,
    "--video",
    input,
    "--mask",
    maskPath,
    "--output",
    output,
    "--quality",
    quality
  ];

  if (!dryRun) {
    await createPropainterMask(maskPath, region, video);
    await runCommand(resolvedPythonPath, args, { cwd: resolvedRepoPath });
  }

  return { args, filter, maskPath };
}

export async function runVideoCleanupJob(options: VideoCleanupOptions): Promise<VideoCleanupResult> {
  const input = absolutePath(options.input, "input");
  const output = absolutePath(options.output, "output");
  const mode = String(options.mode || "").toLowerCase() as VideoCleanupMode;
  if (!VIDEO_CLEANUP_MODES.includes(mode)) {
    throw new VideoCleanupError("VALIDATION_ERROR", `Unsupported mode "${mode || "missing"}".`);
  }

  const region = normalizeRegion(options);
  await checkFfmpegAvailable();
  await assertInputVideo(input);

  const outputDir = path.dirname(output);
  await mkdir(outputDir, { recursive: true });
  await access(outputDir);

  const video = await getVideoMetadata(input);
  validateRegion(region, video);

  if (mode === "ai-inpaint-propainter") {
    const quality = normalizeQuality(options.quality);
    const { args, filter, maskPath } = await runPropainterInpaint({
      input,
      output,
      region,
      video,
      quality,
      dryRun: Boolean(options.dryRun)
    });

    return {
      input,
      output,
      mode,
      region,
      video,
      filter,
      command: "propainter",
      args,
      dryRun: Boolean(options.dryRun),
      engine: "ProPainter",
      quality,
      maskPath
    };
  }

  const { args, filter } = buildArgs(input, output, mode, region, video, options.coverColor);
  if (!options.dryRun) {
    await runCommand("ffmpeg", args);
  }

  return {
    input,
    output,
    mode,
    region,
    video,
    filter,
    command: "ffmpeg",
    args,
    dryRun: Boolean(options.dryRun),
    engine: "FFmpeg"
  };
}
