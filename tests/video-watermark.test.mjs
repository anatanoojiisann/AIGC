import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, stat, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  assertFfmpegAvailable,
  processWatermarkVideo,
  WatermarkProcessingError
} from "../lib/video/watermark.mjs";

function run(command, args) {
  return new Promise((resolve, reject) => {
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

async function createFixtureVideo(directory) {
  const input = path.join(directory, "fixture-watermark.mp4");
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
    input
  ]);
  return input;
}

async function assertFileGenerated(filePath) {
  const info = await stat(filePath);
  assert.ok(info.isFile(), `${filePath} should be a file`);
  assert.ok(info.size > 0, `${filePath} should not be empty`);
}

test("watermark preview and processing outputs are generated", async () => {
  await assertFfmpegAvailable();
  const directory = await mkdtemp(path.join(os.tmpdir(), "aigc-watermark-"));
  try {
    const input = await createFixtureVideo(directory);
    const preview = path.join(directory, "preview.mp4");
    const processed = path.join(directory, "processed.mp4");

    await processWatermarkVideo({
      input,
      output: preview,
      mode: "preview",
      x: 20,
      y: 20,
      w: 80,
      h: 30
    });
    await assertFileGenerated(preview);

    await processWatermarkVideo({
      input,
      output: processed,
      mode: "cover",
      x: 20,
      y: 20,
      w: 80,
      h: 30
    });
    await assertFileGenerated(processed);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("invalid watermark coordinates fail gracefully", async () => {
  await assertFfmpegAvailable();
  const directory = await mkdtemp(path.join(os.tmpdir(), "aigc-watermark-"));
  try {
    const input = await createFixtureVideo(directory);
    const output = path.join(directory, "invalid.mp4");

    await assert.rejects(
      () =>
        processWatermarkVideo({
          input,
          output,
          mode: "delogo",
          x: 300,
          y: 160,
          w: 80,
          h: 40
        }),
      (error) => {
        assert.ok(error instanceof WatermarkProcessingError);
        assert.equal(error.code, "INVALID_COORDINATES");
        return true;
      }
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("npm video:watermark CLI generates a processed output", async () => {
  await assertFfmpegAvailable();
  const directory = await mkdtemp(path.join(os.tmpdir(), "aigc-watermark-cli-"));
  try {
    const input = await createFixtureVideo(directory);
    const output = path.join(directory, "cli-delogo.mp4");

    await run("npm", [
      "run",
      "video:watermark",
      "--",
      "--input",
      input,
      "--output",
      output,
      "--mode",
      "delogo",
      "--x",
      "20",
      "--y",
      "20",
      "--w",
      "80",
      "--h",
      "30"
    ]);

    await assertFileGenerated(output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
