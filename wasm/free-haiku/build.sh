#!/usr/bin/env bash
# free_haiku.wasm を wasm32-unknown-unknown 向けにビルドし src/assets へ配置する。
#
# この端末は Homebrew 版 rustc が /usr/local/bin で PATH を奪い、wasm の std を
# 解決できない。そのため rustup の現行ツールチェイン bin を PATH 前置きして、
# rustup 管理の rustc/cargo（wasm std 同梱）を確実に使う。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# rustup が解決する cargo の bin ディレクトリを PATH 先頭に置く。
TOOLCHAIN_BIN="$(dirname "$(rustup which cargo)")"
export PATH="$TOOLCHAIN_BIN:$PATH"

cargo build \
  --manifest-path "$SCRIPT_DIR/Cargo.toml" \
  --target wasm32-unknown-unknown \
  --release

cp "$SCRIPT_DIR/target/wasm32-unknown-unknown/release/free_haiku.wasm" \
  "$REPO_ROOT/src/assets/free_haiku.wasm"

echo "built: src/assets/free_haiku.wasm"
