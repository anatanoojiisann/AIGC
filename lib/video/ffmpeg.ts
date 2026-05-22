import { access, mkdir, stat } from "fs/promises";
import path from "path";
import { spawn } from "child_process";

export const VIDEO_CLEANUP_MODES = ["preview", "delogo", "blur", "cover", "crop"] as const;

export type VideoCleanupMode = (typeof VIDEO_CLEANUP_MODES)[number];

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
};

export type VideoCleanupResult = {
  input: string;
  output: string;
  mode: VideoCleanupMode;
  region: VideoCleanupRegion;
  video?: VideoMetadata;
  command: "ffmpeg";
  args: string[];
  dryRun: boolean;
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

function commandMissing(command: string) {
  const label = command === "ffprobe" ? "FFprobe" : "FFmpeg";
  return new VideoCleanupError(
    "FFMPEG_NOT_FOUND",
    `${label} is required. Please install FFmpeg and ensure it is available in PATH.`
  );
}

function runCommand(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
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
          command === "ffprobe" ? "UNSUPPORTED_VIDEO_FORMAT" : "PROCESSING_FAILED",
          command === "ffprobe"
            ? "Unsupported video format or unreadable video stream."
            : `FFmpeg processing failed with exit code ${code}.`,
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
  if (mode === "preview") {
    return {
      type: "vf" as const,
      value: `drawbox=x=${region.x}:y=${region.y}:w=${region.w}:h=${region.h}:color=red@0.55:t=4`
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
    return [
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
    ];
  }

  const args = ["-y", "-i", input];
  if (mode === "preview") args.push("-t", "3");
  args.push("-vf", filter.value, ...commonVideoArgs);
  if (mode === "preview") {
    args.push("-an", output);
  } else {
    args.push("-map", "0:v:0", "-map", "0:a?", "-c:a", "copy", output);
  }
  return args;
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

  const args = buildArgs(input, output, mode, region, video, options.coverColor);
  if (!options.dryRun) {
    await runCommand("ffmpeg", args);
  }

  return {
    input,
    output,
    mode,
    region,
    video,
    command: "ffmpeg",
    args,
    dryRun: Boolean(options.dryRun)
  };
}
