import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, stat, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: { ...process.env, ...options.env }, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { code, stdout, stderr };
      if (code === 0 || options.allowFailure) {
        resolve(result);
        return;
      }
      reject(new Error(`${command} exited with ${code}: ${stderr}`));
    });
  });
}

async function createFixtureVideo(directory) {
  const input = path.join(directory, "fixture-video-cleanup.mp4");
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

test("video cleanup CLI preview and delogo outputs are generated", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "aigc-video-cleanup-"));
  try {
    const input = await createFixtureVideo(directory);
    const preview = path.join(directory, "preview.mp4");
    const delogo = path.join(directory, "delogo.mp4");

    const previewResult = await run("node", [
      "--import",
      "tsx",
      "scripts/video-cleanup.ts",
      "--input",
      input,
      "--output",
      preview,
      "--mode",
      "preview",
      "--x",
      "20",
      "--y",
      "20",
      "--w",
      "80",
      "--h",
      "30"
    ]);
    assert.match(previewResult.stdout, /"ok": true/);
    await assertFileGenerated(preview);

    const delogoResult = await run("node", [
      "--import",
      "tsx",
      "scripts/video-cleanup.ts",
      "--input",
      input,
      "--output",
      delogo,
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
    assert.match(delogoResult.stdout, /"ok": true/);
    await assertFileGenerated(delogo);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("video cleanup CLI ProPainter mode returns clean setup error when disabled", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "aigc-video-propainter-disabled-"));
  try {
    const input = await createFixtureVideo(directory);
    const output = path.join(directory, "propainter.mp4");

    const result = await run(
      "node",
      [
        "--import",
        "tsx",
        "scripts/video-cleanup.ts",
        "--input",
        input,
        "--output",
        output,
        "--mode",
        "ai-inpaint-propainter",
        "--x",
        "20",
        "--y",
        "20",
        "--w",
        "80",
        "--h",
        "30",
        "--quality",
        "balanced"
      ],
      {
        allowFailure: true,
        env: {
          PROPAINTER_ENABLED: "false",
          PROPAINTER_REPO_PATH: "",
          PROPAINTER_PYTHON: ""
        }
      }
    );

    assert.notEqual(result.code, 0);
    const payload = JSON.parse(result.stderr);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "PROPAINTER_NOT_INSTALLED");
    assert.doesNotMatch(result.stderr, /\n\s+at\s/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("video cleanup CLI missing input returns structured JSON", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "aigc-video-cleanup-missing-"));
  try {
    const result = await run(
      "node",
      [
        "--import",
        "tsx",
        "scripts/video-cleanup.ts",
        "--input",
        path.join(directory, "missing.mp4"),
        "--output",
        path.join(directory, "output.mp4"),
        "--mode",
        "preview",
        "--x",
        "20",
        "--y",
        "20",
        "--w",
        "80",
        "--h",
        "30"
      ],
      { allowFailure: true }
    );
    assert.notEqual(result.code, 0);
    const payload = JSON.parse(result.stderr);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "INPUT_NOT_FOUND");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("video:watermark remains a compatibility alias", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "aigc-video-watermark-alias-"));
  try {
    const input = await createFixtureVideo(directory);
    const output = path.join(directory, "alias-delogo.mp4");

    const result = await run("node", [
      "--import",
      "tsx",
      "scripts/video-watermark.ts",
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

    assert.match(result.stdout, /"ok": true/);
    await assertFileGenerated(output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
