import { access, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export const WATERMARK_MODES = Object.freeze(["crop", "cover", "delogo", "preview"]);

const SUPPORTED_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);

export class WatermarkProcessingError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "WatermarkProcessingError";
    this.code = code;
    this.details = details;
  }
}

function commandError(command) {
  const label = command === "ffprobe" ? "FFprobe" : "FFmpeg";
  return new WatermarkProcessingError(
    "FFMPEG_NOT_FOUND",
    `${label} is not installed or is not available from the command line. Install FFmpeg and retry.`
  );
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, ...options });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (error && error.code === "ENOENT") {
        reject(commandError(command));
        return;
      }
      reject(
        new WatermarkProcessingError(
          "PROCESSING_FAILED",
          `${command} could not start: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new WatermarkProcessingError(
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

export async function assertFfmpegAvailable() {
  await runCommand("ffmpeg", ["-version"]);
  await runCommand("ffprobe", ["-version"]);
}

function toAbsoluteFile(inputPath, label) {
  if (typeof inputPath !== "string" || !inputPath.trim()) {
    throw new WatermarkProcessingError("VALIDATION_ERROR", `${label} is required.`);
  }
  return path.resolve(process.cwd(), inputPath);
}

async function assertInputFile(inputPath) {
  try {
    const info = await stat(inputPath);
    if (!info.isFile()) {
      throw new WatermarkProcessingError("INPUT_NOT_FOUND", "Input video path is not a file.");
    }
  } catch (error) {
    if (error instanceof WatermarkProcessingError) throw error;
    throw new WatermarkProcessingError("INPUT_NOT_FOUND", "Input video not found.");
  }

  const extension = path.extname(inputPath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new WatermarkProcessingError(
      "UNSUPPORTED_VIDEO_FORMAT",
      `Unsupported video format "${extension || "unknown"}". Use mp4, mov, m4v, webm, mkv, or avi.`
    );
  }
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new WatermarkProcessingError("INVALID_COORDINATES", `${label} must be a positive number.`);
  }
  return Math.round(number);
}

function normalizeRegion(options) {
  return {
    x: positiveInteger(options.x, "x"),
    y: positiveInteger(options.y, "y"),
    w: positiveInteger(options.w, "w"),
    h: positiveInteger(options.h, "h")
  };
}

export async function probeVideo(inputPath) {
  const { stdout } = await runCommand("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "json",
    inputPath
  ]);

  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch {
    throw new WatermarkProcessingError("UNSUPPORTED_VIDEO_FORMAT", "Could not read video metadata.");
  }

  const stream = payload?.streams?.[0];
  const width = Number(stream?.width);
  const height = Number(stream?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new WatermarkProcessingError("UNSUPPORTED_VIDEO_FORMAT", "No readable video stream was found.");
  }

  return { width, height };
}

function validateRegionInsideVideo(region, video) {
  if (region.x + region.w > video.width || region.y + region.h > video.height) {
    throw new WatermarkProcessingError(
      "INVALID_COORDINATES",
      `Selected region must stay inside the video dimensions (${video.width}x${video.height}).`
    );
  }
}

function even(value) {
  return Math.max(2, Math.floor(value / 2) * 2);
}

function cropFilter(region, video) {
  const distances = [
    { edge: "left", value: region.x, limit: Math.max(24, video.width * 0.08) },
    { edge: "right", value: video.width - (region.x + region.w), limit: Math.max(24, video.width * 0.08) },
    { edge: "top", value: region.y, limit: Math.max(24, video.height * 0.08) },
    { edge: "bottom", value: video.height - (region.y + region.h), limit: Math.max(24, video.height * 0.08) }
  ].sort((a, b) => a.value - b.value);

  const nearest = distances[0];
  if (nearest.value > nearest.limit) {
    throw new WatermarkProcessingError(
      "INVALID_COORDINATES",
      "Crop mode is only for watermark regions near a video edge. Use cover or delogo for interior regions."
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

export function buildWatermarkCommand({ inputPath, outputPath, mode, region, video }) {
  const commonVideoArgs = ["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p"];

  if (mode === "preview") {
    return [
      "-y",
      "-i",
      inputPath,
      "-t",
      "3",
      "-vf",
      `drawbox=x=${region.x}:y=${region.y}:w=${region.w}:h=${region.h}:color=red@0.55:t=4`,
      ...commonVideoArgs,
      "-an",
      outputPath
    ];
  }

  if (mode === "crop") {
    return [
      "-y",
      "-i",
      inputPath,
      "-vf",
      cropFilter(region, video),
      ...commonVideoArgs,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-c:a",
      "copy",
      outputPath
    ];
  }

  if (mode === "cover") {
    return [
      "-y",
      "-i",
      inputPath,
      "-filter_complex",
      `[0:v]split[base][region];[region]crop=${region.w}:${region.h}:${region.x}:${region.y},boxblur=4:1[blur];[base][blur]overlay=${region.x}:${region.y}[v]`,
      "-map",
      "[v]",
      "-map",
      "0:a?",
      ...commonVideoArgs,
      "-c:a",
      "copy",
      outputPath
    ];
  }

  if (mode === "delogo") {
    return [
      "-y",
      "-i",
      inputPath,
      "-vf",
      `delogo=x=${region.x}:y=${region.y}:w=${region.w}:h=${region.h}:show=0`,
      ...commonVideoArgs,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-c:a",
      "copy",
      outputPath
    ];
  }

  throw new WatermarkProcessingError("VALIDATION_ERROR", `Unsupported mode "${mode}".`);
}

export async function processWatermarkVideo(options) {
  const inputPath = toAbsoluteFile(options.input, "input");
  const outputPath = toAbsoluteFile(options.output, "output");
  const mode = String(options.mode || "").toLowerCase();
  if (!WATERMARK_MODES.includes(mode)) {
    throw new WatermarkProcessingError(
      "VALIDATION_ERROR",
      `Unsupported mode "${mode || "missing"}". Use crop, cover, delogo, or preview.`
    );
  }

  const region = normalizeRegion(options);

  await assertFfmpegAvailable();
  await assertInputFile(inputPath);

  const outputDir = path.dirname(outputPath);
  await mkdir(outputDir, { recursive: true });
  await access(outputDir);

  const video = await probeVideo(inputPath);
  validateRegionInsideVideo(region, video);

  const args = buildWatermarkCommand({ inputPath, outputPath, mode, region, video });
  await runCommand("ffmpeg", args);

  return {
    inputPath,
    outputPath,
    mode,
    region,
    video,
    command: "ffmpeg",
    args
  };
}
