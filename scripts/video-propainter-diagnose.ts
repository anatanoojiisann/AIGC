import { existsSync, readFileSync } from "fs";
import { mkdir, stat } from "fs/promises";
import path from "path";
import {
  checkPropainterAvailability,
  getPropainterQualityParams,
  getVideoMetadata,
  runVideoCleanupJob,
  VideoCleanupError,
  type ProPainterQuality
} from "../lib/video/ffmpeg";

type Args = {
  input?: string;
  output?: string;
  quality?: string;
  timeoutSec?: string;
  x?: string;
  y?: string;
  w?: string;
  h?: string;
  dryRun?: boolean;
  processingMode?: string;
};

function loadEnvFile(fileName: ".env.local" | ".env") {
  const envPath = path.resolve(process.cwd(), fileName);
  if (!existsSync(envPath)) return false;
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
  return true;
}

function loadEnv() {
  return [".env.local", ".env"].filter((fileName) => loadEnvFile(fileName as ".env.local" | ".env"));
}

function readArgs(argv: string[]) {
  const args: Args = {};
  const aliases: Record<string, keyof Args> = {
    "dry-run": "dryRun",
    "processing-mode": "processingMode"
  };
  const allowed = new Set(["input", "output", "quality", "timeoutSec", "x", "y", "w", "h", "dryRun", "processingMode", ...Object.keys(aliases)]);
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith("--")) throw new VideoCleanupError("VALIDATION_ERROR", `Unexpected argument "${raw}".`);
    const rawKey = raw.slice(2);
    const key = aliases[rawKey] || rawKey;
    if (!allowed.has(rawKey)) throw new VideoCleanupError("VALIDATION_ERROR", `Unsupported argument "--${rawKey}".`);
    if (key === "dryRun") {
      args.dryRun = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new VideoCleanupError("VALIDATION_ERROR", `Missing value for --${key}.`);
    args[key as keyof Args] = value as never;
    index += 1;
  }
  return args;
}

function required(args: Args, key: keyof Args) {
  const value = args[key];
  if (typeof value !== "string" || !value) {
    throw new VideoCleanupError("VALIDATION_ERROR", `Missing required argument --${key}.`);
  }
  return value;
}

function numberArg(args: Args, key: "x" | "y" | "w" | "h", fallback: number) {
  const value = args[key] === undefined ? fallback : Number(args[key]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new VideoCleanupError("INVALID_COORDINATES", `${key} must be a positive number.`);
  }
  return Math.round(value);
}

function normalizeQuality(value?: string): ProPainterQuality {
  const quality = String(value || "extra_fast").trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (quality !== "extra_fast" && quality !== "fast" && quality !== "balanced" && quality !== "high") {
    throw new VideoCleanupError("VALIDATION_ERROR", "quality must be extra_fast, fast, balanced, or high.");
  }
  return quality as ProPainterQuality;
}

function diagnosisFor(input: { width: number; height: number; duration?: number; estimatedFrameCount?: number }, quality: ProPainterQuality) {
  const params = getPropainterQualityParams(quality);
  const processedPixels = Math.round(input.width * params.resizeRatio) * Math.round(input.height * params.resizeRatio);
  const frames = input.estimatedFrameCount || 0;
  if (quality === "high" && input.duration && input.duration > 8) {
    return "High quality processes the full-resolution/full-duration video with more RAFT iterations; on Mac CPU this is expected to be very slow.";
  }
  if (processedPixels * Math.max(frames, 1) > 100_000_000) {
    return "The video has a large resolution x frame-count workload for CPU inference.";
  }
  return "Workload is small enough for a smoke diagnostic.";
}

async function main() {
  const loadedEnv = loadEnv();
  const args = readArgs(process.argv.slice(2));
  const input = path.resolve(process.cwd(), required(args, "input"));
  const output = path.resolve(
    process.cwd(),
    args.output || `./storage/watermark-verification/diagnose-${Date.now()}-${normalizeQuality(args.quality)}.mp4`
  );
  const quality = normalizeQuality(args.quality);
  const timeoutSec = Number(args.timeoutSec || 600);
  if (Number.isFinite(timeoutSec) && timeoutSec > 0) {
    process.env.PROPAINTER_TIMEOUT_MS = String(Math.round(timeoutSec * 1000));
  }
  await mkdir(path.dirname(output), { recursive: true });

  const startedAt = Date.now();
  const availability = await checkPropainterAvailability();
  const metadata = await getVideoMetadata(input);
  const region = {
    x: numberArg(args, "x", 20),
    y: numberArg(args, "y", 20),
    w: numberArg(args, "w", 40),
    h: numberArg(args, "h", 24)
  };
  const params = getPropainterQualityParams(quality);

  try {
    const result = await runVideoCleanupJob({
      input,
      output,
      mode: "ai-inpaint-propainter",
      quality,
      processingMode: args.processingMode === "full-frame" ? "full-frame" : "roi-crop",
      ...region,
      dryRun: Boolean(args.dryRun)
    });
    const outputInfo = args.dryRun ? null : await stat(output);
    const outputMetadata = args.dryRun ? null : await getVideoMetadata(output);
    process.stdout.write(`${JSON.stringify({
      jobId: path.basename(output, path.extname(output)),
      status: args.dryRun ? "dry-run" : "completed",
      phase: args.dryRun ? "prepared" : "completed",
      elapsedSec: Math.round((Date.now() - startedAt) / 1000),
      envLoaded: loadedEnv,
      input: {
        path: input,
        width: metadata.width,
        height: metadata.height,
        duration: metadata.duration,
        fps: metadata.fps,
        estimatedFrames: metadata.estimatedFrameCount
      },
      quality,
      processingMode: result.processingMode,
      roi: result.roi,
      propainterParams: {
        ...params,
        processedWidth: Math.round(metadata.width * params.resizeRatio),
        processedHeight: Math.round(metadata.height * params.resizeRatio)
      },
      process: {
        pid: null,
        alive: false,
        lastHeartbeatAt: null,
        lastStdoutLines: [],
        lastStderrLines: []
      },
      output: {
        path: output,
        exists: Boolean(outputInfo),
        size: outputInfo?.size || 0,
        ffprobeValid: Boolean(outputMetadata)
      },
      command: {
        executable: result.command,
        args: result.args
      },
      availability,
      diagnosis: diagnosisFor(metadata, quality)
    }, null, 2)}\n`);
  } catch (error) {
    const info = await stat(output).catch(() => null);
    process.stdout.write(`${JSON.stringify({
      jobId: path.basename(output, path.extname(output)),
      status: error instanceof VideoCleanupError && error.code === "PROPAINTER_TIMEOUT" ? "timed-out" : "failed",
      phase: error instanceof VideoCleanupError && error.code === "PROPAINTER_TIMEOUT" ? "timed-out" : "failed",
      elapsedSec: Math.round((Date.now() - startedAt) / 1000),
      envLoaded: loadedEnv,
      input: {
        path: input,
        width: metadata.width,
        height: metadata.height,
        duration: metadata.duration,
        fps: metadata.fps,
        estimatedFrames: metadata.estimatedFrameCount
      },
      quality,
      processingMode: args.processingMode || "roi-crop",
      propainterParams: {
        ...params,
        processedWidth: Math.round(metadata.width * params.resizeRatio),
        processedHeight: Math.round(metadata.height * params.resizeRatio)
      },
      process: {
        pid: null,
        alive: false,
        lastHeartbeatAt: null,
        lastStdoutLines: [],
        lastStderrLines: []
      },
      output: {
        path: output,
        exists: Boolean(info),
        size: info?.size || 0,
        ffprobeValid: false
      },
      availability,
      error: {
        code: error instanceof VideoCleanupError ? error.code : "PROCESSING_FAILED",
        message: error instanceof Error ? error.message : String(error),
        details: error instanceof VideoCleanupError ? error.details : undefined
      },
      diagnosis: diagnosisFor(metadata, quality)
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
