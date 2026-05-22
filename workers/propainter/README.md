# ProPainter AI Inpaint Worker

## What This Mode Does

`ai-inpaint-propainter` is an optional local Video Cleanup mode for videos you own, generated yourself, or have permission to edit. It creates a mask from the selected rectangle and sends the video plus mask to a local ProPainter checkout.

If ProPainter is not configured, the app still works and returns a structured `PROPAINTER_NOT_INSTALLED` error for this mode only. Existing FFmpeg modes continue to work.

## License And Commercial Use Warning

ProPainter is a third-party project with its own license, model terms, and dependency requirements. Review the upstream license before using it, especially for commercial work. This project does not include ProPainter code, weights, or models.

Do not use this feature to bypass platform attribution, copyright marks, paywalls, credits, login restrictions, or access controls.

## Required Environment

- Python compatible with your ProPainter checkout
- PyTorch installed according to your hardware
- FFmpeg and FFprobe available in `PATH`
- A local ProPainter repository path
- Any ProPainter model weights required by that repository

## Environment Variables

Keep ProPainter disabled until the optional worker shell has passed the missing-state checks. After the local ProPainter environment is installed, set these in `.env.local`:

```bash
PROPAINTER_ENABLED=true
PROPAINTER_REPO_PATH=/Users/steven-mac2/Documents/ProPainter
PROPAINTER_PYTHON=/opt/miniconda3/envs/propainter/bin/python
```

Do not commit `.env.local`.

## Install Conda

Use Miniconda or Miniforge. On Apple Silicon Macs, Miniforge is often the easiest route:

```bash
brew install --cask miniforge
conda --version
```

If `conda` is not found after installation, open a new terminal or run the shell initialization command suggested by the installer.

## Clone ProPainter

Clone ProPainter outside this app repository:

```bash
cd /Users/steven-mac2/Documents
git clone https://github.com/sczhou/ProPainter.git
cd /Users/steven-mac2/Documents/ProPainter
```

Review the upstream license and model terms before using it.

## Create The `propainter` Env

Create a separate environment so ProPainter dependencies do not affect this Next.js app:

```bash
conda create -n propainter python=3.10 -y
conda activate propainter
python --version
```

Confirm the Python path matches the app config:

```bash
which python
```

Expected path:

```bash
/opt/miniconda3/envs/propainter/bin/python
```

## Install Requirements

From the ProPainter repo:

```bash
cd /Users/steven-mac2/Documents/ProPainter
conda activate propainter
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Install PyTorch according to the upstream ProPainter instructions and your hardware. On Macs without CUDA, expect CPU or MPS behavior to be slower and potentially less compatible than CUDA examples.

## Download Weights

Download the model weights required by the upstream ProPainter project and place them in the paths that ProPainter expects. The exact filenames and directories can change upstream, so follow the ProPainter README for the current model download links.

After downloading weights, keep them under `/Users/steven-mac2/Documents/ProPainter` or the upstream-recommended model directory. Do not commit model weights to this app repo.

## Configure `.env.local`

In this app repo:

```bash
cd /Users/steven-mac2/Documents/AIGC
cp .env.example .env.local
```

Then set:

```bash
PROPAINTER_ENABLED=true
PROPAINTER_REPO_PATH=/Users/steven-mac2/Documents/ProPainter
PROPAINTER_PYTHON=/opt/miniconda3/envs/propainter/bin/python
```

Restart the app after editing `.env.local`.

## Setup Steps

1. Install FFmpeg.
2. Install Conda or Miniforge.
3. Clone ProPainter locally from its official source.
4. Create and activate the `propainter` Conda environment.
5. Install ProPainter dependencies.
6. Download ProPainter weights following the upstream instructions.
7. Set `PROPAINTER_ENABLED=true`.
8. Set `PROPAINTER_REPO_PATH` to the local ProPainter checkout.
9. Set `PROPAINTER_PYTHON` to the Python executable inside that environment.
10. Restart the Next.js app.

## CLI Test Command

```bash
npm run video:watermark -- \
  --input ./storage/watermark-verification/input.mp4 \
  --output ./storage/watermark-verification/output-propainter.mp4 \
  --mode ai-inpaint-propainter \
  --x 20 --y 20 --w 80 --h 30 \
  --quality balanced
```

When ProPainter is not configured, the command should return:

```json
{
  "ok": false,
  "error": {
    "code": "PROPAINTER_NOT_INSTALLED",
    "message": "ProPainter is not installed or enabled..."
  }
}
```

## Troubleshooting

### Missing Model

Download the required ProPainter model weights from the upstream project and place them where that project expects them.

### Missing Dependency

Activate the ProPainter Python environment and reinstall the upstream dependencies. Also verify `PROPAINTER_PYTHON` points at that environment.

```bash
conda activate propainter
python -m pip install -r /Users/steven-mac2/Documents/ProPainter/requirements.txt
```

### OOM

Try the `fast` quality option, reduce video resolution, shorten the clip, or use a machine with more GPU memory.

### Slow Inference

AI inpainting is much slower than FFmpeg filters. Try `fast` quality first and test on short clips before processing full videos.

### Mac Without GPU

CPU-only inference may be very slow or unsupported depending on your ProPainter setup. Use FFmpeg `preview`, `cover`, `blur`, `crop`, or `delogo` modes when ProPainter is unavailable.

If CUDA-specific packages fail on macOS, install the Mac-compatible PyTorch build from the official PyTorch selector and test ProPainter on a very short clip first.
