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
    assert.match(payload.error.message, /optional and not configured/);
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

test("video cleanup API keeps local modes working when optional ProPainter is unavailable", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "aigc-video-upload-api-"));
  try {
    const input = await createFixtureVideo(directory);
    const script = `
      const { readFile } = await import("node:fs/promises");
      const { POST } = await import("./app/api/video-cleanup/upload/route.ts");
      const { GET } = await import("./app/api/video-cleanup/file/[uploadedVideoId]/route.ts");
      const { POST: processVideo } = await import("./app/api/video-cleanup/process/route.ts");
      const { GET: downloadVideo } = await import("./app/api/video-cleanup/download/[outputId]/route.ts");
      const { GET: getPropainterStatus } = await import("./app/api/video-cleanup/propainter-status/route.ts");
      const buffer = await readFile(process.env.UPLOAD_FIXTURE);
      const form = new FormData();
      form.append("file", new File([new Uint8Array(buffer)], "fixture-video-cleanup.mp4", { type: "application/octet-stream" }));
      const uploadResponse = await POST(new Request("http://local/api/video-cleanup/upload", { method: "POST", body: form }));
      const payload = await uploadResponse.json();
      if (uploadResponse.status !== 200 || !payload.ok || !payload.data.uploadedVideoId || !payload.data.previewUrl || !payload.data.width || !payload.data.height) {
        console.error(JSON.stringify({ status: uploadResponse.status, payload }));
        process.exit(1);
      }
      const previewResponse = await GET(new Request("http://local" + payload.data.previewUrl), {
        params: Promise.resolve({ uploadedVideoId: payload.data.uploadedVideoId })
      });
      if (previewResponse.status !== 200 || !(previewResponse.headers.get("content-type") || "").startsWith("video/") || previewResponse.headers.get("cache-control") !== "no-store") {
        console.error(JSON.stringify({ status: previewResponse.status, contentType: previewResponse.headers.get("content-type") }));
        process.exit(1);
      }
      const statusResponse = await getPropainterStatus();
      const statusPayload = await statusResponse.json();
      if (statusResponse.status !== 200 || !statusPayload.ok || statusPayload.data.available !== false || statusPayload.data.code !== "PROPAINTER_NOT_INSTALLED") {
        console.error(JSON.stringify({ status: statusResponse.status, statusPayload }));
        process.exit(1);
      }
      const aiResponse = await processVideo(new Request("http://local/api/video-cleanup/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadedVideoId: payload.data.uploadedVideoId, mode: "ai-inpaint-propainter", quality: "balanced", region: { x: 20, y: 20, w: 80, h: 30 } })
      }));
      const aiPayload = await aiResponse.json();
      if (aiResponse.status !== 200 || aiPayload.ok || aiPayload.error?.code !== "PROPAINTER_NOT_INSTALLED" || !aiPayload.error.message.includes("optional and not configured")) {
        console.error(JSON.stringify({ status: aiResponse.status, aiPayload }));
        process.exit(1);
      }
      const localResponse = await processVideo(new Request("http://local/api/video-cleanup/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadedVideoId: payload.data.uploadedVideoId, mode: "preview", region: { x: 20, y: 20, w: 80, h: 30 } })
      }));
      const localPayload = await localResponse.json();
      if (localResponse.status !== 200 || !localPayload.ok || localPayload.data.outputUrl === payload.data.previewUrl || !localPayload.data.downloadUrl) {
        console.error(JSON.stringify({ status: localResponse.status, localPayload }));
        process.exit(1);
      }
      const delogoResponse = await processVideo(new Request("http://local/api/video-cleanup/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadedVideoId: payload.data.uploadedVideoId, mode: "delogo", region: { x: 20, y: 20, w: 80, h: 30 } })
      }));
      const delogoPayload = await delogoResponse.json();
      if (delogoResponse.status !== 200 || !delogoPayload.ok || delogoPayload.data.outputUrl === payload.data.previewUrl || !delogoPayload.data.downloadUrl) {
        console.error(JSON.stringify({ status: delogoResponse.status, delogoPayload }));
        process.exit(1);
      }
      const downloadResponse = await downloadVideo(new Request("http://local" + delogoPayload.data.downloadUrl), {
        params: Promise.resolve({ outputId: delogoPayload.data.outputId })
      });
      const downloadBytes = await downloadResponse.arrayBuffer();
      if (downloadResponse.status !== 200 || !(downloadResponse.headers.get("content-type") || "").startsWith("video/") || downloadBytes.byteLength <= 0) {
        console.error(JSON.stringify({ status: downloadResponse.status, length: downloadBytes.byteLength }));
        process.exit(1);
      }
      console.log(JSON.stringify({ ok: true, data: payload.data, aiCode: aiPayload.error.code, localOutputUrl: localPayload.data.outputUrl, delogoOutputUrl: delogoPayload.data.outputUrl }));
    `;
    const result = await run("node", ["--import", "tsx", "--eval", script], {
      env: { UPLOAD_FIXTURE: input, PROPAINTER_ENABLED: "false", PROPAINTER_REPO_PATH: "", PROPAINTER_PYTHON: "" }
    });
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.data.originalFileName, "fixture-video-cleanup.mp4");
    assert.match(payload.data.previewUrl, /^\/api\/video-cleanup\/file\//);
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
