#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AIGC_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "$AIGC_ROOT"

FIXTURE="./storage/watermark-verification/input.mp4"
OUTPUT="./storage/watermark-verification/output-propainter.mp4"

if [ ! -f "$FIXTURE" ]; then
  mkdir -p "$(dirname "$FIXTURE")"
  ffmpeg -y \
    -f lavfi -i "testsrc=size=320x180:duration=2:rate=24" \
    -vf "drawbox=x=20:y=20:w=80:h=30:color=black:t=fill" \
    -c:v libx264 -pix_fmt yuv420p \
    "$FIXTURE"
fi

TMP_STDOUT="$(mktemp)"
TMP_STDERR="$(mktemp)"

npm run video:watermark -- \
  --input "$FIXTURE" \
  --output "$OUTPUT" \
  --mode ai-inpaint-propainter \
  --x 20 \
  --y 20 \
  --w 80 \
  --h 30 \
  --quality fast >"$TMP_STDOUT" 2>"$TMP_STDERR"
RESULT=$?

if [ "$RESULT" -ne 0 ]; then
  if grep -q "PROPAINTER_NOT_INSTALLED" "$TMP_STDERR"; then
    cat "$TMP_STDERR"
    printf '\nProPainter is not installed or not fully configured. Detailed environment check:\n'
    bash workers/propainter/check-env.sh || true
    rm -f "$TMP_STDOUT" "$TMP_STDERR"
    exit 0
  fi
  cat "$TMP_STDOUT"
  cat "$TMP_STDERR" >&2
  rm -f "$TMP_STDOUT" "$TMP_STDERR"
  exit "$RESULT"
fi

cat "$TMP_STDOUT"
rm -f "$TMP_STDOUT" "$TMP_STDERR"

if [ ! -s "$OUTPUT" ]; then
  printf 'Processing failed: output file was not created or is empty: %s\n' "$OUTPUT" >&2
  exit 1
fi

ffprobe -v error -show_entries format=duration,size -of json "$OUTPUT"

INPUT_HASH="$(shasum -a 256 "$FIXTURE" | awk '{ print $1 }')"
OUTPUT_HASH="$(shasum -a 256 "$OUTPUT" | awk '{ print $1 }')"
if [ "$INPUT_HASH" = "$OUTPUT_HASH" ]; then
  printf 'Processing failed: input and output hashes are identical.\n' >&2
  exit 1
fi

printf 'ProPainter worker output verified: %s\n' "$OUTPUT"
