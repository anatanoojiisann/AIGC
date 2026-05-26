import { existsSync, readFileSync } from "fs";
import path from "path";
import { runVideoCleanupJob, VideoCleanupError, type VideoCleanupMode } from "../lib/video/ffmpeg";

type CliArgs = {
  input?: string;
  output?: string;
  mode?: string;
  x?: string;
  y?: string;
  w?: string;
  h?: string;
  coverColor?: string;
  dryRun?: boolean;
  quality?: string;
  processingMode?: string;
  allowFullFrame?: boolean;
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

function loadLocalEnvFiles() {
  return [".env.local", ".env"].filter((fileName) => loadEnvFile(fileName as ".env.local" | ".env"));
}

function readArgs(argv: string[]) {
  const args: CliArgs = {};
  const aliases: Record<string, keyof CliArgs> = {
    "cover-color": "coverColor",
    "dry-run": "dryRun",
    "processing-mode": "processingMode",
    "allow-full-frame": "allowFullFrame"
  };
  const allowed = new Set([
    "input",
    "output",
    "mode",
    "x",
    "y",
    "w",
    "h",
    "coverColor",
    "dryRun",
    "quality",
    "processingMode",
    "allowFullFrame",
    ...Object.keys(aliases)
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) {
      throw new VideoCleanupError("VALIDATION_ERROR", `Unexpected argument "${key}".`);
    }

    const rawName = key.slice(2);
    const name = aliases[rawName] || rawName;
    if (!allowed.has(rawName)) {
      throw new VideoCleanupError("VALIDATION_ERROR", `Unsupported argument "--${rawName}".`);
    }

    if (name === "dryRun" || name === "allowFullFrame") {
      if (name === "dryRun") args.dryRun = true;
      if (name === "allowFullFrame") args.allowFullFrame = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new VideoCleanupError("VALIDATION_ERROR", `Missing value for --${name}.`);
    }

    args[name as keyof CliArgs] = value as never;
    index += 1;
  }

  return args;
}

function required(args: CliArgs, name: keyof CliArgs) {
  const value = args[name];
  if (typeof value !== "string" || !value) {
    throw new VideoCleanupError("VALIDATION_ERROR", `Missing required argument --${name}.`);
  }
  return value;
}

function requiredNumber(args: CliArgs, name: "x" | "y" | "w" | "h") {
  return Number(required(args, name));
}

async function main() {
  const loadedEnvFiles = loadLocalEnvFiles();
  const args = readArgs(process.argv.slice(2));
  if (args.mode === "ai-inpaint-propainter") {
    process.stderr.write(`==> Loading env\n`);
    process.stderr.write(`env loaded: ${loadedEnvFiles.length > 0 ? loadedEnvFiles.join(", ") : "none"}\n`);
  }
  const result = await runVideoCleanupJob({
    input: required(args, "input"),
    output: required(args, "output"),
    mode: required(args, "mode") as VideoCleanupMode,
    x: requiredNumber(args, "x"),
    y: requiredNumber(args, "y"),
    w: requiredNumber(args, "w"),
    h: requiredNumber(args, "h"),
    coverColor: args.coverColor,
    dryRun: Boolean(args.dryRun),
    quality: args.quality as never,
    processingMode: args.processingMode as never,
    allowFullFrame: Boolean(args.allowFullFrame)
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        data: {
          input: result.input,
          output: result.output,
          mode: result.mode,
          region: result.region,
          filter: result.filter,
          dryRun: result.dryRun,
          engine: result.engine,
          quality: result.quality,
          processingMode: result.processingMode,
          roi: result.roi,
          propainterParams: result.propainterParams,
          maskPath: result.maskPath
        }
      },
      null,
      2
    )}\n`
  );
}

main().catch((error: unknown) => {
  const code = error instanceof VideoCleanupError ? error.code : "PROCESSING_FAILED";
  const message = error instanceof Error ? error.message : String(error);
  const details = error instanceof VideoCleanupError ? error.details : undefined;
  process.stderr.write(`${JSON.stringify({ ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } }, null, 2)}\n`);
  process.exitCode = 1;
});
