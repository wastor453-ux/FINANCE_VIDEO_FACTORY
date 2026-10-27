#!/usr/bin/env bash
# Copy the factory skills into Muse's custom-skills folder. Idempotent; never touches secrets.
# Usage: bash factory/bin/install-muse.sh [target]   (default: ~/workspace/custom-skills)
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="${1:-$HOME/workspace/custom-skills}"
mkdir -p "$target"
count=0
for d in "$here"/skills/ffx-*/; do
  name="$(basename "$d")"
  rm -rf "${target:?}/$name"
  cp -R "$d" "$target/$name"
  count=$((count + 1))
done
echo "installed $count skills into $target"
ls "$target" | grep '^ffx-' | sed 's/^/  /'
