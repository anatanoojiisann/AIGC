import { processWatermarkVideo, WatermarkProcessingError, type WatermarkMode } from "../lib/video/watermark.mjs";

type CliArgs = {
  input?: string;
  output?: string;
  mode?: WatermarkMode;
  x?: string;
  y?: string;
  w?: string;
  h?: string;
};

function readArgs(argv: string[]) {
  const args: CliArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) {
      throw new WatermarkProcessingError("VALIDATION_ERROR", `Unexpected argument "${key}".`);
    }

    const name = key.slice(2) as keyof CliArgs;
    if (!["input", "output", "mode", "x", "y", "w", "h"].includes(name)) {
      throw new WatermarkProcessingError("VALIDATION_ERROR", `Unsupported argument "--${name}".`);
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new WatermarkProcessingError("VALIDATION_ERROR", `Missing value for --${name}.`);
    }

    args[name] = value as never;
    index += 1;
  }

  return args;
}

function requireArg(args: CliArgs, name: keyof CliArgs) {
  const value = args[name];
  if (!value) {
    throw new WatermarkProcessingError("VALIDATION_ERROR", `Missing required argument --${name}.`);
  }
  return value;
}

function requireNumberArg(args: CliArgs, name: "x" | "y" | "w" | "h") {
  return Number(requireArg(args, name));
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const result = await processWatermarkVideo({
    input: requireArg(args, "input"),
    output: requireArg(args, "output"),
    mode: requireArg(args, "mode") as WatermarkMode,
    x: requireNumberArg(args, "x"),
    y: requireNumberArg(args, "y"),
    w: requireNumberArg(args, "w"),
    h: requireNumberArg(args, "h")
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        data: {
          outputPath: result.outputPath,
          mode: result.mode,
          region: result.region,
          video: result.video
        }
      },
      null,
      2
    )}\n`
  );
}

main().catch((error: unknown) => {
  const code = error instanceof WatermarkProcessingError ? error.code : "PROCESSING_FAILED";
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: { code, message } }, null, 2)}\n`);
  process.exitCode = 1;
});
