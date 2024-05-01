#! /usr/bin/env bash

PROJECT_ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"

reload-dev() {
  # shellcheck source=/dev/null
  source "$PROJECT_ROOT_DIR"/dev.sh
}

