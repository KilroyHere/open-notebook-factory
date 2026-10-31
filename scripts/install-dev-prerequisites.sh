#!/usr/bin/env bash
#
# Install the system prerequisites for Open Notebook development.
# Supported: Debian and Ubuntu on x86_64 or arm64.
#
# Usage:
#   bash scripts/install-dev-prerequisites.sh
#   bash scripts/install-dev-prerequisites.sh --check
#   bash scripts/install-dev-prerequisites.sh --without-docker --without-ffmpeg

set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive

PYTHON_VERSION="3.12"
NODE_MAJOR="22"
CHECK_ONLY=false
INSTALL_DOCKER=true
INSTALL_FFMPEG=true
DOCKER_GROUP_CHANGED=false

usage() {
  cat <<'EOF'
Install Open Notebook Factory development prerequisites on Debian or Ubuntu.

Options:
  --check             Report prerequisite status without changing the system.
  --without-docker    Do not install Docker Engine or Docker Compose.
  --without-ffmpeg    Do not install ffmpeg (only needed for audio/video work).
  -h, --help          Show this help.

The script installs:
  Git, Make, curl, Node.js 22, uv, a uv-managed Python 3.12,
  Docker Engine with Compose v2, and ffmpeg.
EOF
}

log() {
  printf '\n==> %s\n' "$*"
}

ok() {
  printf '  [ok] %s\n' "$*"
}

warn() {
  printf '  [warning] %s\n' "$*" >&2
}

fail() {
  printf '  [error] %s\n' "$*" >&2
  exit 1
}

version_at_least() {
  local actual="$1"
  local required="$2"
  [[ "$(printf '%s\n%s\n' "$required" "$actual" | sort -V | head -n1)" == "$required" ]]
}

command_version() {
  local command_name="$1"
  "$command_name" --version 2>/dev/null | head -n1 || true
}

run_as_root() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    fail "This step needs root access. Install sudo or run the script as root."
  fi
}

for argument in "$@"; do
  case "$argument" in
    --check)
      CHECK_ONLY=true
      ;;
    --without-docker)
      INSTALL_DOCKER=false
      ;;
    --without-ffmpeg)
      INSTALL_FFMPEG=false
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      fail "Unknown option: $argument"
      ;;
  esac
done

[[ "$(uname -s)" == "Linux" ]] || fail \
  "This installer supports Linux only. On macOS install Docker Desktop, Node 22, uv, Git and Make with Homebrew; on Windows use WSL2."

[[ -r /etc/os-release ]] || fail "Cannot identify this Linux distribution."
# shellcheck disable=SC1091
source /etc/os-release

case "${ID:-}" in
  ubuntu | debian)
    ;;
  *)
    fail "Unsupported distribution '${ID:-unknown}'. Use Debian/Ubuntu, or install the prerequisites listed by --help manually."
    ;;
esac

if grep -qi microsoft /proc/version 2>/dev/null; then
  IS_WSL=true
else
  IS_WSL=false
fi

check_prerequisites() {
  local missing=0
  local node_version=""

  log "Prerequisite status"

  for executable in git make curl; do
    if command -v "$executable" >/dev/null 2>&1; then
      ok "$(command_version "$executable")"
    else
      warn "$executable is missing"
      missing=1
    fi
  done

  if command -v node >/dev/null 2>&1; then
    node_version="$(node --version | tr -d 'v')"
    if version_at_least "$node_version" "20.9.0"; then
      ok "Node.js $(node --version)"
    else
      warn "Node.js $node_version is too old; version 20.9 or newer is required"
      missing=1
    fi
  else
    warn "Node.js is missing"
    missing=1
  fi

  if command -v uv >/dev/null 2>&1; then
    ok "$(uv --version)"
    if uv python find "$PYTHON_VERSION" >/dev/null 2>&1; then
      ok "Python $PYTHON_VERSION is available through uv"
    else
      warn "Python $PYTHON_VERSION is not installed through uv"
      missing=1
    fi
  else
    warn "uv is missing"
    missing=1
  fi

  if [[ "$INSTALL_DOCKER" == true ]]; then
    if command -v docker >/dev/null 2>&1; then
      ok "$(docker --version)"
      if docker compose version >/dev/null 2>&1; then
        ok "$(docker compose version)"
      else
        warn "Docker Compose v2 is missing"
        missing=1
      fi
    else
      warn "Docker is missing"
      missing=1
    fi
  fi

  if [[ "$INSTALL_FFMPEG" == true ]]; then
    if command -v ffmpeg >/dev/null 2>&1; then
      ok "$(ffmpeg -version 2>/dev/null | head -n1)"
    else
      warn "ffmpeg is missing"
      missing=1
    fi
  fi

  return "$missing"
}

if [[ "$CHECK_ONLY" == true ]]; then
  if check_prerequisites; then
    log "All requested prerequisites are installed."
    exit 0
  fi
  fail "One or more prerequisites are missing."
fi

log "Installing base packages"
run_as_root apt-get update
base_packages=(ca-certificates curl git gnupg make xz-utils)
if [[ "$INSTALL_FFMPEG" == true ]]; then
  base_packages+=(ffmpeg)
fi
run_as_root apt-get install -y --no-install-recommends "${base_packages[@]}"

install_node() {
  local current_version=""
  local architecture=""
  local checksums=""
  local filename=""
  local download_dir=""
  local install_dir=""

  if command -v node >/dev/null 2>&1; then
    current_version="$(node --version | tr -d 'v')"
    if version_at_least "$current_version" "20.9.0"; then
      ok "Keeping Node.js $(node --version)"
      return
    fi
  fi

  case "$(uname -m)" in
    x86_64)
      architecture="x64"
      ;;
    aarch64 | arm64)
      architecture="arm64"
      ;;
    *)
      fail "Node.js installer does not support architecture $(uname -m)."
      ;;
  esac

  log "Installing the latest Node.js ${NODE_MAJOR}.x release"
  download_dir="$(mktemp -d)"
  checksums="$download_dir/SHASUMS256.txt"
  curl --fail --silent --show-error --location \
    "https://nodejs.org/dist/latest-v${NODE_MAJOR}.x/SHASUMS256.txt" \
    --output "$checksums"
  filename="$(
    awk -v suffix="linux-${architecture}.tar.xz" '$2 ~ suffix "$" { print $2; exit }' "$checksums"
  )"
  [[ -n "$filename" ]] || fail "Could not locate the Node.js ${NODE_MAJOR}.x Linux archive."

  curl --fail --silent --show-error --location \
    "https://nodejs.org/dist/latest-v${NODE_MAJOR}.x/${filename}" \
    --output "$download_dir/$filename"
  (
    cd "$download_dir"
    grep " ${filename}\$" SHASUMS256.txt | sha256sum --check -
  )

  install_dir="/opt/${filename%.tar.xz}"
  run_as_root mkdir -p "$install_dir"
  run_as_root tar -xJf "$download_dir/$filename" \
    --strip-components=1 \
    --directory "$install_dir"
  for executable in node npm npx corepack; do
    run_as_root ln -sfn "$install_dir/bin/$executable" "/usr/local/bin/$executable"
  done
  ok "Installed $(node --version)"
}

install_uv() {
  if ! command -v uv >/dev/null 2>&1; then
    log "Installing uv"
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
  else
    ok "Keeping $(uv --version)"
  fi

  command -v uv >/dev/null 2>&1 || fail \
    "uv was installed but is not on PATH. Add \$HOME/.local/bin to PATH and rerun this script."

  log "Installing Python $PYTHON_VERSION through uv"
  uv python install "$PYTHON_VERSION"
}

install_docker() {
  local repository_url=""
  local keyring="/etc/apt/keyrings/docker.asc"

  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    ok "Keeping $(docker --version) with $(docker compose version)"
    return
  fi

  if [[ "$IS_WSL" == true ]]; then
    fail "Docker is not available in WSL. Install Docker Desktop on Windows, enable WSL integration for this distribution, then rerun the script."
  fi

  log "Installing Docker Engine and Compose v2"
  repository_url="https://download.docker.com/linux/${ID}"
  run_as_root install -m 0755 -d /etc/apt/keyrings
  curl --fail --silent --show-error --location "${repository_url}/gpg" |
    run_as_root tee "$keyring" >/dev/null
  run_as_root chmod a+r "$keyring"

  printf 'deb [arch=%s signed-by=%s] %s %s stable\n' \
    "$(dpkg --print-architecture)" \
    "$keyring" \
    "$repository_url" \
    "${VERSION_CODENAME}" |
    run_as_root tee /etc/apt/sources.list.d/docker.list >/dev/null

  run_as_root apt-get update
  run_as_root apt-get install -y \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin

  if command -v systemctl >/dev/null 2>&1; then
    run_as_root systemctl enable --now docker
  fi

  if [[ "${EUID}" -ne 0 ]] && ! id -nG "$USER" | grep -qw docker; then
    run_as_root usermod -aG docker "$USER"
    DOCKER_GROUP_CHANGED=true
  fi
}

install_node
install_uv
if [[ "$INSTALL_DOCKER" == true ]]; then
  install_docker
fi

log "Verifying installation"
check_prerequisites || fail "Installation completed, but verification still reports missing prerequisites."

cat <<'EOF'

Prerequisites are installed.

Next:
  git clone https://github.com/KilroyHere/open-notebook-factory.git
  cd open-notebook-factory
  git checkout cursor/learning-asides-8171
  uv sync
  cd frontend && npm install && cd ..
  cp .env.example .env

Then set SURREAL_URL=ws://localhost:8000/rpc and a local
OPEN_NOTEBOOK_ENCRYPTION_KEY in .env before running make start-all.
EOF

if [[ "$DOCKER_GROUP_CHANGED" == true ]]; then
  warn "You were added to the docker group. Log out and back in before running Docker without sudo."
fi
