# ProPainter AI Inpaint Worker

## What This Mode Does

`ai-inpaint-propainter` is an optional local Video Cleanup mode for videos you own, generated yourself, or have permission to edit. The AIGC app creates a rectangular mask from the selected watermark/cleanup region and asks a local ProPainter checkout to inpaint that masked area.

If ProPainter is missing or incomplete, the app must still build and run. Only AI Inpaint - ProPainter returns `PROPAINTER_NOT_INSTALLED`; local FFmpeg modes such as Preview, Crop Rescale, Cover Patch, Soft Blur, and Delogo continue to work.

## License And Non-Commercial Warning

ProPainter is a third-party project with its own license, model terms, and dependency requirements. The official code and models are for non-commercial use unless you obtain permission from the rights holder. Review the upstream ProPainter license and model terms before using this mode.

Do not use Video Cleanup or ProPainter to bypass platform attribution, copyright marks, paywalls, credits, login restrictions, or access controls.

## Expected Local Paths

The scripts detect paths when possible, but this project is set up around these defaults:

```bash
AIGC project: /Users/steven-mac2/Documents/AIGC
ProPainter repo: /Users/steven-mac2/Documents/ProPainter
Conda env: propainter
Python path: /opt/miniconda3/envs/propainter/bin/python
```

## Required Environment

- macOS terminal access
- Conda or Miniforge
- Python environment named `propainter`
- PyTorch installed for your hardware
- `cv2` / OpenCV available in the environment
- FFmpeg and FFprobe available in `PATH`
- Local ProPainter repository
- ProPainter model weights under the ProPainter checkout, usually `weights/`

## Setup Scripts

From the AIGC repo:

```bash
cd /Users/steven-mac2/Documents/AIGC
bash workers/propainter/setup-macos.sh
bash workers/propainter/check-env.sh
```

`setup-macos.sh` is safe to rerun. It detects Conda, clones ProPainter if missing, creates the `propainter` environment if missing, and installs `requirements.txt` when available.

The setup script does not download model weights because upstream URLs and license terms can change. Follow the official ProPainter README for current weight download links.

## Install Conda

If `conda` is missing, install Miniforge or Miniconda. Miniforge is often the simplest macOS option:

```bash
brew install --cask miniforge
```

Or download Miniconda from the official Conda site. After installing, open a new terminal and verify:

```bash
conda --version
```

## Clone ProPainter

If the setup script cannot clone the repo, run:

```bash
cd /Users/steven-mac2/Documents
git clone https://github.com/sczhou/ProPainter.git
cd /Users/steven-mac2/Documents/ProPainter
```

Review the upstream license before continuing.

## Create The Conda Environment

The setup script uses Python 3.8 by default:

```bash
conda create -n propainter python=3.8 -y
conda activate propainter
python --version
```

Check the actual Python path:

```bash
which python
```

Use that path for `PROPAINTER_PYTHON`.

## Install Requirements

From the ProPainter repo, install the requirements except `av` and GUI OpenCV wheels, then install headless OpenCV:

```bash
cd /Users/steven-mac2/Documents/ProPainter
conda activate propainter
python -m pip install --upgrade pip
grep -Ev '^(av|opencv-python|opencv-contrib-python|opencv-python-headless)([<>= ].*)?$' requirements.txt > /tmp/propainter-requirements-aigc.txt
python -m pip install -r /tmp/propainter-requirements-aigc.txt
python -m pip uninstall -y opencv-python opencv-contrib-python
python -m pip install opencv-python-headless
```

Then verify the imports that AIGC checks:

```bash
python -c "import torch; import cv2; print('ok')"
```

`av` is optional for this AIGC worker. Do not install `av` by default. The upstream requirements include `av`, but pip `av` plus pip OpenCV can bundle conflicting FFmpeg/AVFoundation dylibs on macOS.

AIGC prefers the headless OpenCV wheel:

```bash
python -m pip uninstall -y opencv-python opencv-contrib-python
python -m pip install opencv-python-headless
```

If PyTorch installation fails on macOS, install the Mac-compatible PyTorch build using the official PyTorch selector, then rerun the ProPainter requirements.

## Download Weights

Download the ProPainter model weights from the upstream ProPainter README and place them where that project expects them. AIGC checks for model files under:

```bash
/Users/steven-mac2/Documents/ProPainter/weights
```

Common model extensions are `.pth`, `.pt`, `.ckpt`, and `.safetensors`.

Do not commit model weights to this repository.

## Configure `.env.local`

In the AIGC repo:

```bash
cd /Users/steven-mac2/Documents/AIGC
```

Add or update:

```bash
PROPAINTER_ENABLED=true
PROPAINTER_REPO_PATH=/Users/steven-mac2/Documents/ProPainter
PROPAINTER_PYTHON=/opt/miniconda3/envs/propainter/bin/python
```

If your detected Python path is different, use the detected path instead.

Do not commit `.env.local`.

## Restart Next.js

After changing `.env.local`, stop the running app and start it again:

```bash
cd /Users/steven-mac2/Documents/AIGC
PORT=3003 npm run dev
```

## Check The Environment

Run:

```bash
bash workers/propainter/check-env.sh
```

If ProPainter is ready, it prints pass results and exits successfully. If it is incomplete, it prints `PROPAINTER_NOT_INSTALLED` and lists the missing setup items.

## CLI Worker Test

Run:

```bash
bash workers/propainter/test-worker.sh
```

This uses:

```bash
npm run video:watermark -- \
  --input ./storage/watermark-verification/input.mp4 \
  --output ./storage/watermark-verification/output-propainter.mp4 \
  --mode ai-inpaint-propainter \
  --x 20 --y 20 --w 80 --h 30 \
  --quality fast
```

If ProPainter is missing, the script returns a clean `PROPAINTER_NOT_INSTALLED` result and prints the missing setup items. If ProPainter is installed, it verifies that `output-propainter.mp4` exists, is readable by FFprobe, and has a different SHA256 hash from the input.

## Browser Test

1. Start the app:

```bash
PORT=3003 npm run dev
```

2. Open:

```text
http://localhost:3003/video-cleanup
```

3. Upload a short local video.
4. Confirm the default mode is Preview.
5. Confirm Preview and Delogo still work.
6. Select AI Inpaint - ProPainter.
7. Choose Fast quality.
8. Process the video.
9. Confirm processed output appears and Download Result works.

## Troubleshooting

### Conda Missing

Install Miniforge or Miniconda, then open a new terminal. Run:

```bash
conda --version
```

### Python Path Wrong

Activate the environment and inspect the actual path:

```bash
conda activate propainter
which python
```

Update `PROPAINTER_PYTHON` in `.env.local`.

### Weights Missing

Follow the upstream ProPainter README to download weights and place them under:

```bash
/Users/steven-mac2/Documents/ProPainter/weights
```

### Torch Import Failure

Activate the environment and install the correct PyTorch build for your Mac:

```bash
conda activate propainter
python -c "import torch"
```

Use the official PyTorch install selector if the ProPainter requirements install a CUDA-only build that does not work on your Mac.

### CV2 Import Failure

Install OpenCV into the environment:

```bash
conda activate propainter
python -m pip install opencv-python-headless
```

### CV2 / PyAV Duplicate `libavdevice` Warning

If `check-env.sh` prints `AVFFrameReceiver`, `AVFAudioReceiver`, or `One of the duplicates must be removed or renamed`, the `cv2` and `av` Python wheels are both loading bundled FFmpeg/AVFoundation libraries. `av` is optional and should usually remain uninstalled. Prefer a clean package fix before touching dylib files manually:

```bash
conda activate propainter
python -m pip uninstall -y opencv-python opencv-contrib-python opencv-python-headless
python -m pip install opencv-python-headless
python -m pip uninstall -y av
```

Then run the direct diagnostic:

```bash
$PROPAINTER_PYTHON - <<'PY'
import cv2
print("cv2", cv2.__version__)
try:
    import av
    print("av", av.__version__)
except Exception as e:
    print("av optional not installed:", e)
PY
```

If you later need `av` for some separate workflow and warnings still appear, use one package family consistently, for example conda-forge OpenCV plus PyAV:

```bash
conda install -n propainter -c conda-forge opencv av -y
```

### FFmpeg Missing

Install FFmpeg:

```bash
brew install ffmpeg
```

Then verify:

```bash
ffmpeg -version
ffprobe -version
```

### Mac Without NVIDIA GPU Is Slow

Most ProPainter examples are designed around CUDA-capable GPUs. On a Mac without NVIDIA GPU support, inference can be slow or may require CPU/MPS-compatible dependency adjustments. Test with a very short clip and `--quality fast`.

### OOM Or Memory Issues

Use shorter clips, lower resolution, `--quality fast`, or a machine with more available GPU/CPU memory.

### ProPainter Unavailable But Local Modes Still Work

This is expected. Preview, Crop Rescale, Cover Patch, Soft Blur, and Delogo are local FFmpeg modes and should continue to work even when ProPainter is not installed.
