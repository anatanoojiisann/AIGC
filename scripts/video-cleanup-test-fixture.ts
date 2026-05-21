import { mkdir } from "fs/promises";
import path from "path";
import { spawn } from "child_process";

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with ${code}: ${stderr}`));
    });
  });
}

async function main() {
  const directory = path.resolve(process.cwd(), "storage", "watermark-verification");
  const output = path.join(directory, "input.mp4");
  await mkdir(directory, { recursive: true });
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=320x180:duration=2:rate=24",
    "-vf",
    "drawbox=x=20:y=20:w=80:h=30:color=black:t=fill",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    output
  ]);

  process.stdout.write(`${JSON.stringify({ ok: true, data: { output } }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: { code: "PROCESSING_FAILED", message } }, null, 2)}\n`);
  process.exitCode = 1;
});
