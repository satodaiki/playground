//! FREE THE BIRDS のコア（籠の解放と boids 群れ）。
//!
//! 純粋ロジックは `rng` / `boids` モジュールに閉じ、`cargo test` で単体検証する。
//! WASM へは `extern "C"` の整数/浮動小数 ABI を公開する（wasm-bindgen 不要・
//! 外部 import なし）。鳥の座標は線形メモリ上の平坦な f32 バッファ
//! （`birds_ptr()` ＋ `bird_count() * 4` 要素）として TS 側へ晒す。
//!
//! グローバルなワールド状態は、ブラウザが単一スレッドであることを利用して
//! `thread_local! + RefCell` で安全に保持する（既存 3 作品と同じ方式）。

pub mod boids;
pub mod rng;

use std::cell::RefCell;

use boids::World;

thread_local! {
    /// 世界のグローバル状態。
    static WORLD: RefCell<World> = RefCell::new(World::EMPTY);
}

/// 指定シードと画面サイズで世界を初期化する。ページ表示時にフロントから呼ぶ。
#[no_mangle]
pub extern "C" fn init(s0: u32, s1: u32, w: f32, h: f32) {
    WORLD.with(|c| *c.borrow_mut() = World::new(s0, s1, w, h));
}

/// 画面リサイズを反映する。
#[no_mangle]
pub extern "C" fn resize(w: f32, h: f32) {
    WORLD.with(|c| c.borrow_mut().resize(w, h));
}

/// 扉を開けて群れを解放する。
#[no_mangle]
pub extern "C" fn release() {
    WORLD.with(|c| c.borrow_mut().release());
}

/// 同一シードで籠に戻す（初期状態を決定的に再現）。
#[no_mangle]
pub extern "C" fn reset() {
    WORLD.with(|c| c.borrow_mut().reset());
}

/// ポインタ（風）の位置と有効フラグ（0/1）。
#[no_mangle]
pub extern "C" fn set_pointer(x: f32, y: f32, active: u32) {
    WORLD.with(|c| c.borrow_mut().set_pointer(x, y, active != 0));
}

/// 世界を `dt_ms` ミリ秒進める。
#[no_mangle]
pub extern "C" fn tick(dt_ms: f32) {
    WORLD.with(|c| c.borrow_mut().tick(dt_ms));
}

/// 鳥の数。
#[no_mangle]
pub extern "C" fn bird_count() -> u32 {
    WORLD.with(|c| c.borrow().count() as u32)
}

/// 鳥バッファ（[x, y, vx, vy] × bird_count）の先頭ポインタ。
/// 次の init/reset までは安定している。TS 側は毎フレーム読み直す。
#[no_mangle]
pub extern "C" fn birds_ptr() -> *const f32 {
    WORLD.with(|c| c.borrow().birds_ptr())
}

/// 解放済みなら 1。
#[no_mangle]
pub extern "C" fn is_released() -> u32 {
    WORLD.with(|c| u32::from(c.borrow().released()))
}

/// 籠の矩形（描画とヒットテストの単一定義点）。
#[no_mangle]
pub extern "C" fn cage_x() -> f32 {
    WORLD.with(|c| c.borrow().cage().x)
}

#[no_mangle]
pub extern "C" fn cage_y() -> f32 {
    WORLD.with(|c| c.borrow().cage().y)
}

#[no_mangle]
pub extern "C" fn cage_w() -> f32 {
    WORLD.with(|c| c.borrow().cage().w)
}

#[no_mangle]
pub extern "C" fn cage_h() -> f32 {
    WORLD.with(|c| c.borrow().cage().h)
}
