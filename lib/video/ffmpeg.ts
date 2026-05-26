import { access, copyFile, mkdir, rm, stat } from "fs/promises";
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
  fps?: number;
  estimatedFrameCount?: number;
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
  missing?: string[];
  repoPath?: string;
  pythonPath?: string;
  diagnostics?: ProPainterDiagnostics;
};

export type ProPainterDiagnostics = {
  enabled: boolean;
  repoPath: string | null;
  pythonPath: string | null;
  repoExists: boolean;
  pythonExists: boolean;
  pythonExecutable: boolean;
  inferenceEntrypointExists: boolean;
  inferenceEntrypointPath: string | null;
  weightsDirExists: boolean;
  requiredWeightsFound: boolean;
  requiredWeights: Record<string, boolean>;
  canImportTorch: boolean;
  canImportCv2: boolean;
  torchVersion: string | null;
  cv2Version: string | null;
  cudaAvailable: boolean;
  checkedFrom: string;
};

export type ProPainterParams = {
  resizeRatio: number;
  neighborLength: number;
  refStride: number;
  subvideoLength: number;
  raftIter: number;
  fp16: boolean;
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
const propainterEntrypoint = "inference_propainter.py";
const requiredPropainterWeights = ["ProPainter.pth", "recurrent_flow_completion.pth", "raft-things.pth"] as const;

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

type RunCommandOptions = {
  cwd?: string;
  env?: Record<string, string>;
  stream?: boolean;
  label?: string;
  jobId?: string;
  phase?: string;
  monitorOutputPath?: string;
  timeoutMs?: number;
  heartbeatMs?: number;
  failureCode?: string;
  timeoutCode?: string;
};

function logProgress(message: string) {
  process.stderr.write(`${message}\n`);
}

function appendRecentLines(lines: string[], text: string) {
  const nextLines = text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
  lines.push(...nextLines);
  if (lines.length > 20) lines.splice(0, lines.length - 20);
}

async function outputSnapshot(filePath?: string) {
  if (!filePath) return { exists: false, size: 0 };
  try {
    const info = await stat(filePath);
    return { exists: info.isFile(), size: info.isFile() ? info.size : 0 };
  } catch {
    return { exists: false, size: 0 };
  }
}

function processSnapshot(pid: number) {
  return new Promise<string | null>((resolve) => {
    if (!pid || pid <= 0 || process.platform === "win32") {
      resolve(null);
      return;
    }
    let child;
    try {
      child = spawn("ps", ["-o", "%cpu=,%mem=,rss=,state=", "-p", String(pid)], { stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      resolve(null);
      return;
    }
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve(null);
    }, 1000);
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolve(stdout.trim() || null);
    });
  });
}

function logPhase(phase: string, details?: Record<string, unknown>) {
  logProgress(`==> Phase: ${phase}`);
  if (details) logProgress(JSON.stringify(details, null, 2));
}

function hasDuplicateAvFoundationWarning(output: string) {
  return /AVFFrameReceiver|AVFAudioReceiver|One of the duplicates must be removed or renamed|libavdevice/.test(output);
}

function duplicateAvFoundationError(stderr: string) {
  return new VideoCleanupError(
    "PROPAINTER_DYLIB_CONFLICT",
    "ProPainter Python has a cv2/PyAV duplicate libavdevice conflict. Replace opencv-python with opencv-python-headless or align opencv/av packages from conda-forge.",
    { stderr: stderr.trim() }
  );
}

function killProcessTree(pid: number, signal: NodeJS.Signals) {
  if (!pid || pid <= 0) return;
  if (process.platform !== "win32") {
    spawn("pkill", [`-${signal.replace("SIG", "")}`, "-P", String(pid)], { stdio: "ignore" }).on("error", () => undefined);
  }
  try {
    process.kill(pid, signal);
  } catch {
    // Process already exited.
  }
}

function runCommand(command: string, args: string[], options: RunCommandOptions = {}) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const recentStdout: string[] = [];
    const recentStderr: string[] = [];
    const label = options.label || command;
    const startedAt = Date.now();
    let settled = false;
    let timeoutTimer: NodeJS.Timeout | undefined;
    let heartbeatTimer: NodeJS.Timeout | undefined;

    const writeHeartbeat = async () => {
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      const snapshot = await outputSnapshot(options.monitorOutputPath);
      const cpuMemory = await processSnapshot(child.pid || 0);
      logProgress(
        `==> Heartbeat: phase=${options.phase || "running"} jobId=${options.jobId || "n/a"} elapsed=${elapsed}s childPid=${child.pid ?? "unknown"} childAlive=${!settled} outputExists=${snapshot.exists} outputSize=${snapshot.size}${cpuMemory ? ` ps="${cpuMemory}"` : " ps=unavailable"}`
      );
      if (recentStdout.length > 0) {
        logProgress("==> Last stdout lines:");
        logProgress(recentStdout.join("\n"));
      }
      if (recentStderr.length > 0) {
        logProgress("==> Last stderr lines:");
        logProgress(recentStderr.join("\n"));
      }
    };

    if (options.stream) {
      logProgress(`==> Command started: pid=${child.pid ?? "unknown"} timeout=${Math.round((options.timeoutMs || 0) / 1000)}s`);
      if (options.heartbeatMs && options.heartbeatMs > 0) {
        void writeHeartbeat();
      }
    }

    if (options.timeoutMs && options.timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const elapsed = Math.round((Date.now() - startedAt) / 1000);
        killProcessTree(child.pid || 0, "SIGTERM");
        setTimeout(() => killProcessTree(child.pid || 0, "SIGKILL"), 2000).unref();
        reject(
          new VideoCleanupError(
            options.timeoutCode || "PROPAINTER_TIMEOUT",
            `${label} timed out after ${elapsed} seconds.`,
            { command, args, elapsedSeconds: elapsed }
          )
        );
      }, options.timeoutMs);
      timeoutTimer.unref();
    }

    if (options.stream && options.heartbeatMs && options.heartbeatMs > 0) {
      heartbeatTimer = setInterval(() => {
        void writeHeartbeat();
      }, options.heartbeatMs);
      heartbeatTimer.unref();
    }

    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      appendRecentLines(recentStdout, text);
      if (options.stream) process.stderr.write(text);
    });
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      appendRecentLines(recentStderr, text);
      if (options.stream) process.stderr.write(text);
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (error.code === "ENOENT") {
        reject(commandMissing(command));
        return;
      }
      reject(new VideoCleanupError("PROCESSING_FAILED", `${command} could not start: ${error.message}`));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (options.stream) {
        logProgress(`==> Command finished: exitCode=${code ?? "unknown"}`);
      }
      if (options.failureCode?.startsWith("PROPAINTER") && hasDuplicateAvFoundationWarning(stderr)) {
        reject(duplicateAvFoundationError(stderr));
        return;
      }
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
              : options.failureCode || "PROCESSING_FAILED",
          command === "ffprobe"
            ? "Unsupported video format or unreadable video stream."
            : command === "ffmpeg"
              ? `FFmpeg processing failed with exit code ${code}.`
              : `ProPainter processing failed with exit code ${code}.`,
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
    "stream=width,height,avg_frame_rate,r_frame_rate,nb_frames:format=duration",
    "-of",
    "json",
    inputPath
  ]);

  let payload: {
    streams?: Array<{ width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string; nb_frames?: string }>;
    format?: { duration?: string };
  };
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
  const fps = parseFrameRate(stream?.avg_frame_rate) || parseFrameRate(stream?.r_frame_rate);
  const exactFrameCount = Number(stream?.nb_frames);
  const estimatedFrameCount = Number.isFinite(exactFrameCount) && exactFrameCount > 0
    ? exactFrameCount
    : Number.isFinite(duration) && duration > 0 && fps
      ? Math.round(duration * fps)
      : undefined;
  return {
    width,
    height,
    ...(Number.isFinite(duration) && duration > 0 ? { duration } : {}),
    ...(fps ? { fps } : {}),
    ...(estimatedFrameCount ? { estimatedFrameCount } : {})
  };
}

function parseFrameRate(value?: string) {
  if (!value) return undefined;
  const [rawNumerator, rawDenominator] = value.split("/");
  const numerator = Number(rawNumerator);
  const denominator = Number(rawDenominator || 1);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator <= 0 || denominator <= 0) {
    return undefined;
  }
  return numerator / denominator;
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

function delogoSafeRegion(region: VideoCleanupRegion, video: VideoMetadata) {
  const margin = 1;
  const x = Math.min(Math.max(region.x, margin), Math.max(margin, video.width - margin - 2));
  const y = Math.min(Math.max(region.y, margin), Math.max(margin, video.height - margin - 2));
  const maxW = video.width - x - margin;
  const maxH = video.height - y - margin;
  const w = even(Math.min(region.w, maxW));
  const h = even(Math.min(region.h, maxH));

  if (w < 2 || h < 2 || x + w >= video.width || y + h >= video.height) {
    throw new VideoCleanupError(
      "INVALID_COORDINATES",
      "Delogo mode needs a selected region with a small margin inside the video frame. Move the box slightly away from the edge or use Cover Patch."
    );
  }

  return { x, y, w, h };
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
    const safeRegion = delogoSafeRegion(region, video);
    return {
      type: "vf" as const,
      value: `delogo=x=${safeRegion.x}:y=${safeRegion.y}:w=${safeRegion.w}:h=${safeRegion.h}:show=0`
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

function propainterNotInstalled(details?: unknown) {
  return new VideoCleanupError(
    "PROPAINTER_NOT_INSTALLED",
    propainterUnavailableMessage,
    details
  );
}

async function directoryExists(directory: string) {
  try {
    const info = await stat(directory);
    return info.isDirectory();
  } catch {
    return false;
  }
}

async function executableExists(filePath: string) {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;
    await access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function fileExists(filePath: string) {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

async function canRunPythonImport(pythonPath: string | null, moduleName: "torch" | "cv2") {
  if (!pythonPath || !(await executableExists(pythonPath))) return false;
  try {
    await runCommand(pythonPath, ["-c", `import ${moduleName}`]);
    return true;
  } catch {
    return false;
  }
}

async function pythonEval(pythonPath: string | null, code: string) {
  if (!pythonPath || !(await executableExists(pythonPath))) return null;
  try {
    const { stdout } = await runCommand(pythonPath, ["-c", code]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function getPropainterDiagnostics(): Promise<ProPainterDiagnostics> {
  const checkedFrom = process.cwd();
  const enabled = process.env.PROPAINTER_ENABLED === "true";
  const repoPath = process.env.PROPAINTER_REPO_PATH?.trim() || null;
  const pythonPath = process.env.PROPAINTER_PYTHON?.trim() || null;
  const resolvedRepoPath = repoPath ? path.resolve(checkedFrom, repoPath) : null;
  const resolvedPythonPath = pythonPath ? path.resolve(checkedFrom, pythonPath) : null;
  const weightsDir = resolvedRepoPath ? path.join(resolvedRepoPath, "weights") : null;
  const entrypointPath = resolvedRepoPath ? path.join(resolvedRepoPath, propainterEntrypoint) : null;

  const requiredWeights: Record<string, boolean> = {};
  for (const weight of requiredPropainterWeights) {
    requiredWeights[weight] = weightsDir ? await fileExists(path.join(weightsDir, weight)) : false;
  }

  const repoExists = resolvedRepoPath ? await directoryExists(resolvedRepoPath) : false;
  const pythonExists = resolvedPythonPath ? await fileExists(resolvedPythonPath) : false;
  const pythonExecutable = resolvedPythonPath ? await executableExists(resolvedPythonPath) : false;
  const inferenceEntrypointExists = entrypointPath ? await fileExists(entrypointPath) : false;
  const weightsDirExists = weightsDir ? await directoryExists(weightsDir) : false;

  return {
    enabled,
    repoPath: resolvedRepoPath,
    pythonPath: resolvedPythonPath,
    repoExists,
    pythonExists,
    pythonExecutable,
    inferenceEntrypointExists,
    inferenceEntrypointPath: inferenceEntrypointExists ? entrypointPath : null,
    weightsDirExists,
    requiredWeightsFound: Object.values(requiredWeights).every(Boolean),
    requiredWeights,
    canImportTorch: await canRunPythonImport(resolvedPythonPath, "torch"),
    canImportCv2: await canRunPythonImport(resolvedPythonPath, "cv2"),
    torchVersion: await pythonEval(resolvedPythonPath, "import torch; print(torch.__version__)"),
    cv2Version: await pythonEval(resolvedPythonPath, "import cv2; print(cv2.__version__)"),
    cudaAvailable: (await pythonEval(resolvedPythonPath, "import torch; print('true' if torch.cuda.is_available() else 'false')")) === "true",
    checkedFrom
  };
}

async function getPropainterEnvironment() {
  const diagnostics = await getPropainterDiagnostics();
  const missing: string[] = [];
  if (!diagnostics.enabled) missing.push("Set PROPAINTER_ENABLED=true.");
  if (!diagnostics.repoPath) missing.push("Set PROPAINTER_REPO_PATH to your local ProPainter checkout.");
  if (!diagnostics.pythonPath) missing.push("Set PROPAINTER_PYTHON to the Python executable in the propainter environment.");
  if (diagnostics.repoPath && !diagnostics.repoExists) missing.push(`ProPainter repo not found: ${diagnostics.repoPath}`);
  if (diagnostics.pythonPath && !diagnostics.pythonExists) missing.push(`ProPainter Python not found: ${diagnostics.pythonPath}`);
  if (diagnostics.pythonPath && !diagnostics.pythonExecutable) missing.push(`ProPainter Python not executable: ${diagnostics.pythonPath}`);
  if (!diagnostics.inferenceEntrypointExists) {
    missing.push(`ProPainter inference entrypoint not found: ${diagnostics.repoPath ? path.join(diagnostics.repoPath, propainterEntrypoint) : propainterEntrypoint}`);
  }
  if (!diagnostics.weightsDirExists) {
    missing.push(`ProPainter weights directory not found: ${diagnostics.repoPath ? path.join(diagnostics.repoPath, "weights") : "weights"}`);
  }
  if (!diagnostics.requiredWeightsFound) {
    const missingWeights = Object.entries(diagnostics.requiredWeights)
      .filter(([, found]) => !found)
      .map(([name]) => name);
    missing.push(`Required ProPainter weights missing: ${missingWeights.join(", ")}`);
  }
  if (!diagnostics.canImportTorch) missing.push("ProPainter Python cannot import torch.");
  if (!diagnostics.canImportCv2) missing.push("ProPainter Python cannot import cv2.");

  if (missing.length > 0 || !diagnostics.repoPath || !diagnostics.pythonPath || !diagnostics.inferenceEntrypointPath) {
    throw propainterNotInstalled({
      ...diagnostics,
      missing
    });
  }

  return {
    resolvedRepoPath: diagnostics.repoPath,
    resolvedPythonPath: diagnostics.pythonPath,
    script: diagnostics.inferenceEntrypointPath,
    diagnostics
  };
}

export async function checkPropainterAvailability(): Promise<ProPainterAvailability> {
  try {
    const { diagnostics } = await getPropainterEnvironment();
    return { available: true, diagnostics, repoPath: diagnostics.repoPath || undefined, pythonPath: diagnostics.pythonPath || undefined };
  } catch (error) {
    if (error instanceof VideoCleanupError && error.code === "PROPAINTER_NOT_INSTALLED") {
      const details = error.details as (ProPainterDiagnostics & { missing?: string[] }) | undefined;
      return {
        available: false,
        code: "PROPAINTER_NOT_INSTALLED",
        message: propainterUnavailableMessage,
        missing: details?.missing,
        repoPath: details?.repoPath || undefined,
        pythonPath: details?.pythonPath || undefined,
        diagnostics: details
      };
    }
    throw error;
  }
}

async function createPropainterMask(maskPath: string, region: VideoCleanupRegion, video: VideoMetadata) {
  const args = [
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
  ];
  logProgress(`==> Exact mask command: ffmpeg ${args.map(shellQuote).join(" ")}`);
  try {
    await runCommand("ffmpeg", args);
  } catch (error) {
    throw new VideoCleanupError("PROPAINTER_MASK_FAILED", "Could not create the ProPainter mask image.", error);
  }
}

async function extractPropainterFrames(input: string, framesRoot: string) {
  await rm(framesRoot, { recursive: true, force: true }).catch(() => undefined);
  await mkdir(framesRoot, { recursive: true });
  const args = [
    "-y",
    "-i",
    input,
    "-map",
    "0:v:0",
    "-q:v",
    "2",
    path.join(framesRoot, "%08d.png")
  ];
  logProgress(`==> Exact frame extraction command: ffmpeg ${args.map(shellQuote).join(" ")}`);
  await runCommand("ffmpeg", args, {
    stream: true,
    label: "FFmpeg frame extraction",
    heartbeatMs: Number(process.env.PROPAINTER_HEARTBEAT_MS || 10_000),
    timeoutMs: Number(process.env.PROPAINTER_PREP_TIMEOUT_MS || 120_000),
    failureCode: "PROCESSING_FAILED",
    timeoutCode: "PROPAINTER_TIMEOUT"
  });
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
  const jobId = path.basename(output, path.extname(output));
  logPhase("validating-env", { jobId, quality });
  const { resolvedRepoPath, resolvedPythonPath, script, diagnostics } = await getPropainterEnvironment();

  const maskPath = path.join(path.dirname(output), `${path.basename(output, path.extname(output))}-mask.png`);
  const filter = `propainter-mask=x=${region.x}:y=${region.y}:w=${region.w}:h=${region.h}:quality=${quality}`;
  const runOutputDir = path.join(path.dirname(output), `${path.basename(output, path.extname(output))}-propainter-work`);
  const framesRoot = path.join(path.dirname(output), `${path.basename(output, path.extname(output))}-propainter-frames`);
  const propainterInput = framesRoot;
  const videoName = path.basename(propainterInput);
  const generatedOutput = path.join(runOutputDir, videoName, "inpaint_out.mp4");
  const params = getPropainterQualityParams(quality);
  const args = [
    script,
    "-i",
    propainterInput,
    "-m",
    maskPath,
    "-o",
    runOutputDir,
    "--mode",
    "video_inpainting",
    ...propainterQualityArgs(quality)
  ];
  if (video.fps && Number.isFinite(video.fps) && video.fps > 0) {
    args.push("--save_fps", String(Math.max(1, Math.round(video.fps))));
  }

  if (!dryRun) {
    await rm(output, { force: true }).catch(() => undefined);
    await rm(runOutputDir, { recursive: true, force: true }).catch(() => undefined);
    logPhase("probing-input", {
      jobId,
      input,
      width: video.width,
      height: video.height,
      duration: video.duration,
      fps: video.fps,
      estimatedFrameCount: video.estimatedFrameCount
    });
    logProgress("==> ProPainter diagnostics:");
    logProgress(JSON.stringify(diagnostics, null, 2));
    logProgress(`==> Input video metadata: ${JSON.stringify(video)}`);
    logProgress(`==> Computed ProPainter params: ${JSON.stringify(params)}`);
    logProgress(`==> Mask path: ${maskPath}`);
    logProgress(`==> Output path: ${output}`);
    logProgress(`==> Exact ProPainter command: ${resolvedPythonPath} ${args.map(shellQuote).join(" ")}`);
    logProgress("==> Python/ProPainter stdout:");
    logProgress("==> Python/ProPainter stderr:");
    logPhase("creating-mask", { jobId, maskPath });
    await createPropainterMask(maskPath, region, video);
    logPhase("preparing-input", { jobId, runOutputDir, framesRoot, generatedOutput });
    await extractPropainterFrames(input, framesRoot);
    logPhase("running-propainter", { jobId, startedAt: new Date().toISOString() });
    try {
      await runCommand(resolvedPythonPath, args, {
        cwd: resolvedRepoPath,
        env: {
          MPLCONFIGDIR: path.join(path.dirname(output), ".matplotlib"),
          PYTHONPATH: resolvedRepoPath,
          PYTORCH_ENABLE_MPS_FALLBACK: "1"
        },
        stream: true,
        label: "Python/ProPainter",
        jobId,
        phase: "running-propainter",
        monitorOutputPath: generatedOutput,
        heartbeatMs: Number(process.env.PROPAINTER_HEARTBEAT_MS || 10_000),
        timeoutMs: Number(process.env.PROPAINTER_TIMEOUT_MS || 600_000),
        failureCode: "PROPAINTER_INFERENCE_FAILED",
        timeoutCode: "PROPAINTER_TIMEOUT"
      });
    } catch (error) {
      logPhase(error instanceof VideoCleanupError && error.code === "PROPAINTER_TIMEOUT" ? "timed-out" : "failed", {
        jobId,
        output,
        generatedOutput
      });
      throw error;
    }
    try {
      logPhase("validating-output", { jobId, generatedOutput, output });
      const info = await stat(generatedOutput);
      if (!info.isFile() || info.size <= 0) {
        throw new Error("Generated ProPainter output is empty.");
      }
      await copyFile(generatedOutput, output);
      const finalInfo = await stat(output);
      if (!finalInfo.isFile() || finalInfo.size <= 0) {
        throw new Error("Copied ProPainter output is empty.");
      }
      const outputMetadata = await getVideoMetadata(output);
      if (!outputMetadata.duration || outputMetadata.duration <= 0) {
        throw new Error("Output duration was not greater than zero.");
      }
      logPhase("completed", { jobId, output, size: finalInfo.size, duration: outputMetadata.duration });
    } catch (error) {
      logPhase("failed", { jobId, output, generatedOutput });
      throw new VideoCleanupError(
        "PROPAINTER_OUTPUT_INVALID",
        `ProPainter finished but did not create a readable output video at ${generatedOutput}.`,
        error
      );
    }
  }

  return { args, filter, maskPath };
}

function shellQuote(value: string) {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function getPropainterQualityParams(quality: ProPainterQuality): ProPainterParams {
  if (quality === "fast") {
    return { resizeRatio: 0.5, neighborLength: 5, refStride: 10, subvideoLength: 40, raftIter: 5, fp16: false };
  }
  if (quality === "balanced") {
    return { resizeRatio: 0.75, neighborLength: 10, refStride: 10, subvideoLength: 60, raftIter: 10, fp16: false };
  }
  return { resizeRatio: 1, neighborLength: 10, refStride: 10, subvideoLength: 80, raftIter: 20, fp16: false };
}

function propainterQualityArgs(quality: ProPainterQuality) {
  const params = getPropainterQualityParams(quality);
  const args = [
    "--resize_ratio",
    String(params.resizeRatio),
    "--neighbor_length",
    String(params.neighborLength),
    "--ref_stride",
    String(params.refStride),
    "--subvideo_length",
    String(params.subvideoLength),
    "--raft_iter",
    String(params.raftIter)
  ];
  if (params.fp16) args.push("--fp16");
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
