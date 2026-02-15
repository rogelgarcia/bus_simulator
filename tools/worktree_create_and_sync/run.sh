#!/usr/bin/env bash
# Creates or reuses a named git worktree, then runs asset sync inside it.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEFAULT_WORKTREES_ROOT="$(cd "${REPO_ROOT}/.." && pwd)/bus_simulator_worktrees"

print_usage() {
  cat <<EOF
worktreeCreateAndSync

Usage:
  bash tools/worktree_create_and_sync/run.sh <name> [options]

Arguments:
  <name>                  Branch/worktree name

Options:
  --root <path>           Worktrees root directory (default: ${DEFAULT_WORKTREES_ROOT})
  --dry-run               Print actions only
  --help                  Show this help
EOF
}

NAME=""
WORKTREES_ROOT="${DEFAULT_WORKTREES_ROOT}"
DRY_RUN="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      print_usage
      exit 0
      ;;
    --dry-run)
      DRY_RUN="1"
      shift
      ;;
    --root)
      WORKTREES_ROOT="${2:-}"
      shift 2
      ;;
    --root=*)
      WORKTREES_ROOT="${1#--root=}"
      shift
      ;;
    --*)
      echo "[worktreeCreateAndSync] Failed: Unknown option: $1" >&2
      exit 1
      ;;
    *)
      if [[ -n "${NAME}" ]]; then
        echo "[worktreeCreateAndSync] Failed: Unexpected argument: $1" >&2
        exit 1
      fi
      NAME="$1"
      shift
      ;;
  esac
done

if [[ -z "${NAME}" ]]; then
  echo "[worktreeCreateAndSync] Failed: Missing required argument: <name>" >&2
  exit 1
fi

if [[ "${NAME}" == -* || "${NAME}" == *".."* || "${NAME}" == *"\\"* || "${NAME}" == *" "* || "${NAME}" == */ ]]; then
  echo "[worktreeCreateAndSync] Failed: Unsafe branch/worktree name: ${NAME}" >&2
  exit 1
fi

if [[ ! "${WORKTREES_ROOT}" = /* ]]; then
  WORKTREES_ROOT="${REPO_ROOT}/${WORKTREES_ROOT}"
fi

WORKTREE_PATH="${WORKTREES_ROOT}/${NAME}"

run_cmd() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    echo "[dry-run] $*"
  else
    eval "$@"
  fi
}

BRANCH_EXISTS="0"
if git -C "${REPO_ROOT}" show-ref --verify --quiet "refs/heads/${NAME}"; then
  BRANCH_EXISTS="1"
fi

if [[ "${DRY_RUN}" == "1" ]]; then
  echo "[dry-run] mkdir -p '${WORKTREES_ROOT}'"
else
  mkdir -p "${WORKTREES_ROOT}"
fi

if [[ -d "${WORKTREE_PATH}/.git" || -f "${WORKTREE_PATH}/.git" ]]; then
  echo "[worktreeCreateAndSync] Reusing existing worktree: ${WORKTREE_PATH}"
else
  if [[ "${BRANCH_EXISTS}" == "1" ]]; then
    run_cmd "git -C \"${REPO_ROOT}\" worktree add \"${WORKTREE_PATH}\" \"${NAME}\""
  else
    run_cmd "git -C \"${REPO_ROOT}\" worktree add \"${WORKTREE_PATH}\" -b \"${NAME}\""
  fi
  echo "[worktreeCreateAndSync] Created worktree: ${WORKTREE_PATH}"
fi

if [[ "${DRY_RUN}" == "1" ]]; then
  echo "[dry-run] (cd '${WORKTREE_PATH}' && node tools/asset_sync/run.mjs)"
  exit 0
fi

if command -v node >/dev/null 2>&1; then
  (cd "${WORKTREE_PATH}" && node tools/asset_sync/run.mjs)
  echo "[worktreeCreateAndSync] Asset sync completed in ${WORKTREE_PATH}"
  exit 0
fi

echo "[worktreeCreateAndSync] node is not available; falling back to filesystem copy." >&2
SOURCE_ASSETS="${REPO_ROOT}/assets"
DEST_ASSETS="${WORKTREE_PATH}/assets"
if [[ ! -d "${SOURCE_ASSETS}" ]]; then
  echo "[worktreeCreateAndSync] Failed: Source assets directory not found: ${SOURCE_ASSETS}" >&2
  exit 1
fi
mkdir -p "${DEST_ASSETS}"
cp -a "${SOURCE_ASSETS}/." "${DEST_ASSETS}/"
echo "[worktreeCreateAndSync] Asset copy fallback completed in ${WORKTREE_PATH}"
