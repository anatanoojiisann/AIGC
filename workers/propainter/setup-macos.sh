#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AIGC_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DOCUMENTS_DIR="/Users/steven-mac2/Documents"
PROPAINTER_REPO_PATH="${PROPAINTER_REPO_PATH:-${DOCUMENTS_DIR}/ProPainter}"
ENV_NAME="${PROPAINTER_ENV_NAME:-propainter}"
PYTHON_VERSION="${PROPAINTER_PYTHON_VERSION:-3.8}"

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

CONDA_BIN="$(detect_conda || true)"
if [ -z "$CONDA_BIN" ]; then
  cat <<'MSG'
Conda was not found.

Install Miniconda or Miniforge first, then open a new terminal and rerun this script.

Suggested macOS options:
  brew install --cask miniforge

Or download Miniconda from:
  https://docs.conda.io/en/latest/miniconda.html
MSG
  exit 1
fi

printf 'Using conda: %s\n' "$CONDA_BIN"

if [ ! -d "$PROPAINTER_REPO_PATH" ]; then
  mkdir -p "$DOCUMENTS_DIR"
  cd "$DOCUMENTS_DIR"
  git clone https://github.com/sczhou/ProPainter.git
else
  printf 'ProPainter repo already exists: %s\n' "$PROPAINTER_REPO_PATH"
fi

if ! "$CONDA_BIN" env list | awk '{ print $1 }' | grep -qx "$ENV_NAME"; then
  "$CONDA_BIN" create -n "$ENV_NAME" "python=${PYTHON_VERSION}" -y
else
  printf 'Conda env already exists: %s\n' "$ENV_NAME"
fi

if [ -f "${PROPAINTER_REPO_PATH}/requirements.txt" ]; then
  "$CONDA_BIN" run -n "$ENV_NAME" python -m pip install --upgrade pip
  "$CONDA_BIN" run -n "$ENV_NAME" python -m pip install -r "${PROPAINTER_REPO_PATH}/requirements.txt"
else
  printf 'requirements.txt was not found in %s. Check the ProPainter checkout.\n' "$PROPAINTER_REPO_PATH"
fi

PYTHON_PATH="$("$CONDA_BIN" run -n "$ENV_NAME" python -c 'import sys; print(sys.executable)')"

cat <<MSG

Model weights are not downloaded by this script.
Follow the official ProPainter README for current model links and place weights under:
  ${PROPAINTER_REPO_PATH}/weights

Add these values to ${AIGC_ROOT}/.env.local:

PROPAINTER_ENABLED=true
PROPAINTER_REPO_PATH=${PROPAINTER_REPO_PATH}
PROPAINTER_PYTHON=${PYTHON_PATH}

Then restart the Next.js app and run:
  bash workers/propainter/check-env.sh
  bash workers/propainter/test-worker.sh
MSG
