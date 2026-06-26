#!/usr/bin/env bash
#
# JIYU GACHA の Rust コアを WebAssembly にビルドし、
# playground が読み込む src/assets/gacha_core.wasm へ配置する。
# 追加ツール（wasm-pack / trunk）は不要。rustup と cargo だけで完結する。
#
#   ./build.sh
set -euo pipefail
cd "$(dirname "$0")"

TARGET="wasm32-unknown-unknown"

# rustup 利用環境なら wasm ターゲットを用意する（未導入でも失敗させない）。
if command -v rustup >/dev/null 2>&1; then
  rustup target add "$TARGET" >/dev/null 2>&1 || true
  # Homebrew 版 rustc など、非 rustup の rustc が PATH を奪っていると wasm の
  # std が見つからない。アクティブな rustup ツールチェインの bin を前置きして回避。
  TC_BIN="$(dirname "$(rustup which cargo 2>/dev/null || true)")"
  if [ -n "${TC_BIN:-}" ] && [ -d "$TC_BIN" ]; then
    export PATH="$TC_BIN:$PATH"
  fi
fi

echo "==> building wasm ($TARGET)"
cargo build --release --target "$TARGET"

WASM_SRC="target/$TARGET/release/jiyu_gacha_core.wasm"
DEST="../../src/assets/gacha_core.wasm"
cp "$WASM_SRC" "$DEST"
echo "==> copied to $DEST ($(wc -c < "$DEST") bytes)"
echo "==> done"
