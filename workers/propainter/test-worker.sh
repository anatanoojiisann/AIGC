#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AIGC_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "$AIGC_ROOT"

step() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf '\nERROR: %s\n' "$1" >&2
  exit 1
}

load_env_file() {
  local file="$1"
  [ -f "$file" ] || return 0
  while IFS= read -r raw_line || [ -n "$raw_line" ]; do
    local line key value
    line="$(printf '%s' "$raw_line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    [ -n "$line" ] || continue
    case "$line" in \#*) continue ;; esac
    key="${line%%=*}"
    value="${line#*=}"
    [ "$key" != "$line" ] || continue
    if [ -z "${!key+x}" ]; then
      value="${value%\"}"
      value="${value#\"}"
      value="${value%\'}"
      value="${value#\'}"
      export "$key=$value"
    fi
  done < "$file"
}

step "Loading local ProPainter environment"
load_env_file ".env.local"
load_env_file ".env"
printf 'env loaded from .env.local/.env when present\n'

FIXTURE="./storage/watermark-verification/input-smoke.mp4"
OUTPUT="./storage/watermark-verification/output-propainter-smoke.mp4"
TIMEOUT_SECONDS="${PROPAINTER_TEST_TIMEOUT_SECONDS:-600}"

step "Checking env values"
printf 'Active PROPAINTER_ENABLED=%s\n' "${PROPAINTER_ENABLED:-}"
printf 'Active PROPAINTER_REPO_PATH=%s\n' "${PROPAINTER_REPO_PATH:-}"
printf 'Active PROPAINTER_PYTHON=%s\n' "${PROPAINTER_PYTHON:-}"

step "Deleting old ProPainter output"
rm -f "./storage/watermark-verification/output-propainter.mp4" \
  "./storage/watermark-verification/output-propainter-smoke.mp4" \
  "./storage/watermark-verification/output-propainter-mask.png" \
  "./storage/watermark-verification/output-propainter-smoke-mask.png"
rm -rf "./storage/watermark-verification/output-propainter-propainter-work" \
  "./storage/watermark-verification/output-propainter-smoke-propainter-work"
printf 'old output deleted: %s\n' "$OUTPUT"

step "Creating/checking smoke input"
RECREATE_SMOKE=0
if [ ! -f "$FIXTURE" ]; then
  RECREATE_SMOKE=1
else
  SMOKE_WIDTH="$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$FIXTURE" 2>/dev/null || printf '0')"
  SMOKE_HEIGHT="$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$FIXTURE" 2>/dev/null || printf '0')"
  if [ "${SMOKE_WIDTH:-0}" -lt 256 ] || [ "${SMOKE_HEIGHT:-0}" -lt 144 ]; then
    printf 'existing smoke input is too small for ProPainter fast mode after resize: %sx%s\n' "$SMOKE_WIDTH" "$SMOKE_HEIGHT"
    RECREATE_SMOKE=1
  fi
fi

if [ "$RECREATE_SMOKE" -eq 1 ]; then
  printf 'smoke input missing, creating fixture: %s\n' "$FIXTURE"
  mkdir -p "$(dirname "$FIXTURE")"
  ffmpeg -y \
    -f lavfi -i "testsrc=size=256x144:duration=2:rate=10" \
    -vf "drawbox=x=20:y=20:w=40:h=24:color=white@0.9:t=fill,drawbox=x=20:y=20:w=40:h=24:color=black:t=2" \
    -c:v libx264 -pix_fmt yuv420p \
    "$FIXTURE"
fi
[ -s "$FIXTURE" ] || fail "input video is missing or empty: $FIXTURE"
ffprobe -v error -show_entries format=duration,size -of json "$FIXTURE" >/dev/null \
  || fail "smoke input is not ffprobe-valid: $FIXTURE"
printf 'input exists: %s\n' "$FIXTURE"

step "Running npm run video:watermark"
printf 'command: npm run video:watermark -- --input %s --output %s --mode ai-inpaint-propainter --x 20 --y 20 --w 40 --h 24 --quality fast\n' "$FIXTURE" "$OUTPUT"
TIMEOUT_MARKER="$(mktemp)"
RUN_LOG="$(mktemp)"
STARTED_AT="$(date +%s)"
kill_tree() {
  local pid="$1"
  local signal="${2:-TERM}"
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child" "$signal"
  done
  kill "-${signal}" "$pid" 2>/dev/null || true
}

(
  printf '==> Python/ProPainter stdout:\n'
  printf '==> Python/ProPainter stderr:\n'
  npm run video:watermark -- \
    --input "$FIXTURE" \
    --output "$OUTPUT" \
    --mode ai-inpaint-propainter \
    --x 20 \
    --y 20 \
    --w 40 \
    --h 24 \
    --quality fast
) >"$RUN_LOG" 2>&1 &
CHILD_PID=$!
printf 'command started: pid=%s timeout=%ss\n' "$CHILD_PID" "$TIMEOUT_SECONDS"
printf '==> Heartbeat: still running, elapsed=0s\n'
tail -n +1 -f "$RUN_LOG" &
TAIL_PID=$!

(
  while [ "$(( $(date +%s) - STARTED_AT ))" -lt "$TIMEOUT_SECONDS" ]; do
    sleep 10
    if ! kill -0 "$CHILD_PID" 2>/dev/null; then
      exit 0
    fi
    printf '==> Heartbeat: still running, elapsed=%ss\n' "$(( $(date +%s) - STARTED_AT ))"
  done
  if kill -0 "$CHILD_PID" 2>/dev/null; then
    printf 'timeout\n' > "$TIMEOUT_MARKER"
    printf '\nERROR: ProPainter timed out after %s seconds. Killing process tree rooted at %s.\n' "$TIMEOUT_SECONDS" "$CHILD_PID" >&2
    kill_tree "$CHILD_PID" TERM
    sleep 2
    kill_tree "$CHILD_PID" KILL
  fi
) &
WATCHDOG_PID=$!

wait "$CHILD_PID"
RESULT=$?
kill "$WATCHDOG_PID" 2>/dev/null || true
wait "$WATCHDOG_PID" 2>/dev/null || true
kill "$TAIL_PID" 2>/dev/null || true
wait "$TAIL_PID" 2>/dev/null || true

if [ -s "$TIMEOUT_MARKER" ]; then
  rm -f "$TIMEOUT_MARKER"
  rm -f "$RUN_LOG"
  fail "PROPAINTER_TIMEOUT: ProPainter took longer than ${TIMEOUT_SECONDS} seconds."
fi
rm -f "$TIMEOUT_MARKER"

if [ "$RESULT" -ne 0 ]; then
  printf '==> Command finished: exitCode=%s\n' "$RESULT" >&2
  printf '\nDetailed environment check:\n' >&2
  if bash workers/propainter/check-env.sh; then
    printf 'Environment is ready, so the failure came from the ProPainter execution step.\n' >&2
  else
    printf 'Environment check failed. Fix the missing ProPainter setup above.\n' >&2
  fi
  printf 'PROPAINTER_INFERENCE_FAILED\n' >&2
  rm -f "$RUN_LOG"
  exit "$RESULT"
fi
printf '==> Command finished: exitCode=0\n'

if grep -Eq 'AVFFrameReceiver|AVFAudioReceiver|One of the duplicates must be removed or renamed' "$RUN_LOG"; then
  printf '\nDetected duplicate cv2/PyAV libavdevice warning during smoke inference:\n' >&2
  grep -E 'AVFFrameReceiver|AVFAudioReceiver|One of the duplicates must be removed or renamed' "$RUN_LOG" >&2 || true
  rm -f "$RUN_LOG"
  fail "PROPAINTER_DYLIB_CONFLICT: replace opencv-python with opencv-python-headless or align opencv/av from conda-forge."
fi
rm -f "$RUN_LOG"

step "Validating output"
if [ ! -s "$OUTPUT" ]; then
  if [ "${PROPAINTER_ENABLED:-}" != "true" ]; then
    printf 'PROPAINTER_NOT_INSTALLED\n' >&2
    bash workers/propainter/check-env.sh || true
  fi
  fail "PROPAINTER_OUTPUT_INVALID: output file was not created or is empty: $OUTPUT"
fi
printf 'output exists: %s\n' "$OUTPUT"

step "Starting ffprobe validation"
PROBE_JSON="$(ffprobe -v error -show_entries format=duration,size -of json "$OUTPUT")" || fail "ffprobe could not read output video."
step "ffprobe result:"
printf '%s\n' "$PROBE_JSON"
DURATION="$(printf '%s\n' "$PROBE_JSON" | node -e 'let text=""; process.stdin.on("data", c => text += c); process.stdin.on("end", () => { const data = JSON.parse(text); console.log(Number(data.format?.duration || 0)); });')"
SIZE="$(printf '%s\n' "$PROBE_JSON" | node -e 'let text=""; process.stdin.on("data", c => text += c); process.stdin.on("end", () => { const data = JSON.parse(text); console.log(Number(data.format?.size || 0)); });')"
node -e 'const duration = Number(process.argv[1]); if (!Number.isFinite(duration) || duration <= 0) process.exit(1);' "$DURATION" \
  || fail "PROPAINTER_OUTPUT_INVALID: ffprobe read the output but duration was not greater than 0."
node -e 'const size = Number(process.argv[1]); if (!Number.isFinite(size) || size <= 0) process.exit(1);' "$SIZE" \
  || fail "PROPAINTER_OUTPUT_INVALID: ffprobe read the output but size was not greater than 0."
printf 'ffprobe validation passed: duration=%ss size=%s bytes\n' "$DURATION" "$SIZE"

step "Comparing input/output hashes"
INPUT_HASH="$(shasum -a 256 "$FIXTURE" | awk '{ print $1 }')"
OUTPUT_HASH="$(shasum -a 256 "$OUTPUT" | awk '{ print $1 }')"
if [ "$INPUT_HASH" = "$OUTPUT_HASH" ]; then
  fail "PROPAINTER_OUTPUT_INVALID: input and output hashes are identical."
fi
printf 'hash comparison passed\n'
printf 'input sha256:  %s\n' "$INPUT_HASH"
printf 'output sha256: %s\n' "$OUTPUT_HASH"

printf '==> PASS\n'
printf 'ProPainter worker output verified: %s\n' "$OUTPUT"
