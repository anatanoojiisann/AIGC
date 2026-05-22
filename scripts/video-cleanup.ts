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
};

function readArgs(argv: string[]) {
  const args: CliArgs = {};
  const allowed = new Set(["input", "output", "mode", "x", "y", "w", "h", "coverColor", "dryRun"]);

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) {
      throw new VideoCleanupError("VALIDATION_ERROR", `Unexpected argument "${key}".`);
    }

    const name = key.slice(2);
    if (!allowed.has(name)) {
      throw new VideoCleanupError("VALIDATION_ERROR", `Unsupported argument "--${name}".`);
    }

    if (name === "dryRun") {
      args.dryRun = true;
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
  const args = readArgs(process.argv.slice(2));
  const result = await runVideoCleanupJob({
    input: required(args, "input"),
    output: required(args, "output"),
    mode: required(args, "mode") as VideoCleanupMode,
    x: requiredNumber(args, "x"),
    y: requiredNumber(args, "y"),
    w: requiredNumber(args, "w"),
    h: requiredNumber(args, "h"),
    coverColor: args.coverColor,
    dryRun: Boolean(args.dryRun)
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
          dryRun: result.dryRun
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
  process.stderr.write(`${JSON.stringify({ ok: false, error: { code, message } }, null, 2)}\n`);
  process.exitCode = 1;
});
