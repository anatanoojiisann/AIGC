#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AIGC_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
EXPECTED_REPO="/Users/steven-mac2/Documents/ProPainter"
EXPECTED_ENV_NAME="propainter"

pass_count=0
fail_count=0
missing_items=()

pass() {
  printf 'pass: %s\n' "$1"
  pass_count=$((pass_count + 1))
}

fail() {
  printf 'fail: %s\n' "$1"
  missing_items+=("$1")
  fail_count=$((fail_count + 1))
}

detect_conda() {
  if command -v conda >/dev/null 2>&1; then
    command -v conda
    return 0
  fi
  for candidate in /opt/miniconda3/bin/conda /opt/homebrew/Caskroom/miniforge/base/bin/conda /opt/homebrew/bin/conda "$HOME/miniforge3/bin/conda" "$HOME/miniconda3/bin/conda"; do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

env_value() {
  local key="$1"
  if [ -f "${AIGC_ROOT}/.env.local" ]; then
    awk -F= -v k="$key" '$1 == k { value=$0; sub(/^[^=]*=/, "", value); gsub(/^"|"$/, "", value); gsub(/^'\''|'\''$/, "", value); print value }' "${AIGC_ROOT}/.env.local" | tail -1
  fi
}

CONDA_BIN="$(detect_conda || true)"
REPO_PATH="${PROPAINTER_REPO_PATH:-$(env_value PROPAINTER_REPO_PATH)}"
PYTHON_PATH="${PROPAINTER_PYTHON:-$(env_value PROPAINTER_PYTHON)}"
PROPAINTER_ENABLED_VALUE="${PROPAINTER_ENABLED:-$(env_value PROPAINTER_ENABLED)}"

[ -n "$REPO_PATH" ] || REPO_PATH="$EXPECTED_REPO"

if [ -n "$CONDA_BIN" ]; then
  pass "conda available: $("$CONDA_BIN" --version 2>/dev/null || printf '%s' "$CONDA_BIN")"
else
  fail "conda missing. Install Miniconda or Miniforge, then open a new terminal."
fi

if [ -n "$CONDA_BIN" ] && "$CONDA_BIN" env list 2>/dev/null | awk '{ print $1 }' | grep -qx "$EXPECTED_ENV_NAME"; then
  pass "conda env available: ${EXPECTED_ENV_NAME}"
else
  fail "conda env missing: ${EXPECTED_ENV_NAME}"
fi

if [ -z "$PYTHON_PATH" ] && [ -n "$CONDA_BIN" ]; then
  PYTHON_PATH="$("$CONDA_BIN" run -n "$EXPECTED_ENV_NAME" python -c 'import sys; print(sys.executable)' 2>/dev/null || true)"
fi
[ -n "$PYTHON_PATH" ] || PYTHON_PATH="/opt/miniconda3/envs/propainter/bin/python"

if [ -x "$PYTHON_PATH" ]; then
  pass "ProPainter python executable: $PYTHON_PATH"
else
  fail "ProPainter python missing or not executable: $PYTHON_PATH"
fi

if [ -d "$REPO_PATH" ]; then
  pass "ProPainter repo available: $REPO_PATH"
else
  fail "ProPainter repo missing: $REPO_PATH"
fi

ENTRYPOINT_FOUND=""
for entrypoint in inference_propainter.py inference/propainter.py scripts/inference_propainter.py; do
  if [ -f "${REPO_PATH}/${entrypoint}" ]; then
    ENTRYPOINT_FOUND="${REPO_PATH}/${entrypoint}"
    break
  fi
done
if [ -n "$ENTRYPOINT_FOUND" ]; then
  pass "ProPainter inference entrypoint found: $ENTRYPOINT_FOUND"
else
  fail "ProPainter inference entrypoint missing. Expected inference_propainter.py or a known equivalent."
fi

if [ -x "$PYTHON_PATH" ] && "$PYTHON_PATH" -c 'import torch; import cv2' >/dev/null 2>&1; then
  pass "python can import torch and cv2"
else
  fail "python cannot import torch and cv2. Install ProPainter requirements in the propainter env."
fi

if [ -x "$PYTHON_PATH" ]; then
  IMPORT_STDOUT="$(mktemp)"
  IMPORT_STDERR="$(mktemp)"
  "$PYTHON_PATH" - >"$IMPORT_STDOUT" 2>"$IMPORT_STDERR" <<'PY'
import cv2
print("cv2", cv2.__version__)
try:
    import av
    print("av", av.__version__)
except Exception as e:
    print("av optional not installed:", e)
PY
  IMPORT_RESULT=$?
  IMPORT_OUTPUT="$(cat "$IMPORT_STDOUT" "$IMPORT_STDERR")"
  rm -f "$IMPORT_STDOUT" "$IMPORT_STDERR"
  if [ "$IMPORT_RESULT" -ne 0 ]; then
    fail "cv2 import diagnostic failed. Run: \$PROPAINTER_PYTHON - <<'PY' ... import cv2"
    printf '%s\n' "$IMPORT_OUTPUT"
  elif printf '%s\n' "$IMPORT_OUTPUT" | grep -Eq 'AVFFrameReceiver|AVFAudioReceiver|One of the duplicates must be removed or renamed|libavdevice'; then
    fail "cv2/av duplicate libavdevice dylib conflict detected. Prefer opencv-python-headless or aligned conda-forge opencv/av packages."
    printf '%s\n' "$IMPORT_OUTPUT"
  else
    printf 'pass: cv2 import diagnostic clean; av optional: %s\n' "$(printf '%s\n' "$IMPORT_OUTPUT" | tr '\n' '; ')"
  fi
else
  fail "cv2 import diagnostic skipped because ProPainter Python is not executable."
fi

if command -v ffmpeg >/dev/null 2>&1; then
  pass "ffmpeg available: $(ffmpeg -version 2>/dev/null | head -1)"
else
  fail "ffmpeg missing from PATH"
fi

if command -v ffprobe >/dev/null 2>&1; then
  pass "ffprobe available: $(ffprobe -version 2>/dev/null | head -1)"
else
  fail "ffprobe missing from PATH"
fi

WEIGHTS_DIR="${REPO_PATH}/weights"
MISSING_WEIGHTS=()
for weight in ProPainter.pth recurrent_flow_completion.pth raft-things.pth; do
  if [ ! -f "${WEIGHTS_DIR}/${weight}" ]; then
    MISSING_WEIGHTS+=("$weight")
  fi
done
if [ -d "$WEIGHTS_DIR" ] && [ "${#MISSING_WEIGHTS[@]}" -eq 0 ]; then
  pass "Required ProPainter weights found under: $WEIGHTS_DIR"
else
  fail "Required ProPainter weights missing under ${WEIGHTS_DIR}: ${MISSING_WEIGHTS[*]:-weights directory missing}"
fi

if [ -f "${AIGC_ROOT}/.env.local" ]; then
  if [ "$PROPAINTER_ENABLED_VALUE" = "true" ]; then
    pass ".env.local has PROPAINTER_ENABLED=true"
  else
    fail ".env.local missing PROPAINTER_ENABLED=true"
  fi
  if [ -n "$(env_value PROPAINTER_REPO_PATH)" ]; then
    pass ".env.local has PROPAINTER_REPO_PATH"
  else
    fail ".env.local missing PROPAINTER_REPO_PATH"
  fi
  if [ -n "$(env_value PROPAINTER_PYTHON)" ]; then
    pass ".env.local has PROPAINTER_PYTHON"
  else
    fail ".env.local missing PROPAINTER_PYTHON"
  fi
else
  fail ".env.local missing in ${AIGC_ROOT}"
fi

printf '\nSummary: %s passed, %s failed.\n' "$pass_count" "$fail_count"
if [ "$fail_count" -gt 0 ]; then
  printf 'PROPAINTER_NOT_INSTALLED\n'
  printf 'Missing setup items:\n'
  for item in "${missing_items[@]}"; do
    printf -- '- %s\n' "$item"
  done
  exit 1
fi

printf 'ProPainter environment is ready.\n'
