//! LEAP TO FREEDOM のコア（重力反転ランナー）。
//!
//! 純粋ロジックは `rng` / `game` モジュールに閉じ、`cargo test` で単体検証する。
//! WASM へは `extern "C"` の整数/浮動小数 ABI を公開する（wasm-bindgen 不要・
//! 外部 import なし）。描画に属する色やラベルは TS 側に置き、ここは数値状態に徹する。
//!
//! グローバルなワールド状態は、ブラウザが単一スレッドであることを利用して
//! `thread_local! + RefCell` で安全に保持する（`unsafe` 不要・`jiyu-gacha` と同じ方式）。

pub mod game;
pub mod rng;

use std::cell::RefCell;

use game::World;

thread_local! {
    /// ゲーム世界のグローバル状態。
    static WORLD: RefCell<World> = RefCell::new(World::EMPTY);
}

/// 指定シードで世界を初期化する。ゲーム開始時にフロントから呼ぶ。
#[no_mangle]
pub extern "C" fn init(s0: u32, s1: u32) {
    WORLD.with(|w| *w.borrow_mut() = World::new(s0, s1));
}

/// 現在のシード状態へ巻き戻して再開する。
#[no_mangle]
pub extern "C" fn reset() {
    WORLD.with(|w| w.borrow_mut().reset());
}

/// 重力の向きを上下反転する（ワンボタン入力）。
#[no_mangle]
pub extern "C" fn flip() {
    WORLD.with(|w| w.borrow_mut().flip());
}

/// 世界を `dt_ms` ミリ秒進める。
#[no_mangle]
pub extern "C" fn tick(dt_ms: f32) {
    WORLD.with(|w| w.borrow_mut().tick(dt_ms));
}

/// プレイヤー矩形の上端 Y 座標。
#[no_mangle]
pub extern "C" fn player_y() -> f32 {
    WORLD.with(|w| w.borrow().player_y())
}

/// プレイヤーの縦速度（px/ms）。
#[no_mangle]
pub extern "C" fn player_vel() -> f32 {
    WORLD.with(|w| w.borrow().player_vel())
}

/// 画面内の障害物数。
#[no_mangle]
pub extern "C" fn obstacle_count() -> u32 {
    WORLD.with(|w| w.borrow().obstacle_count())
}

/// `i` 番目の障害物 X。
#[no_mangle]
pub extern "C" fn obstacle_x(i: u32) -> f32 {
    WORLD.with(|w| w.borrow().obstacle_x(i))
}

/// `i` 番目の障害物 Y。
#[no_mangle]
pub extern "C" fn obstacle_y(i: u32) -> f32 {
    WORLD.with(|w| w.borrow().obstacle_y(i))
}

/// `i` 番目の障害物の幅。
#[no_mangle]
pub extern "C" fn obstacle_w(i: u32) -> f32 {
    WORLD.with(|w| w.borrow().obstacle_w(i))
}

/// `i` 番目の障害物の高さ。
#[no_mangle]
pub extern "C" fn obstacle_h(i: u32) -> f32 {
    WORLD.with(|w| w.borrow().obstacle_h(i))
}

/// 生存距離＝スコア。
#[no_mangle]
pub extern "C" fn score() -> u32 {
    WORLD.with(|w| w.borrow().score())
}

/// ゲームオーバーなら 1、プレイ中なら 0。
#[no_mangle]
pub extern "C" fn is_over() -> u32 {
    WORLD.with(|w| w.borrow().is_over() as u32)
}

/// フィールド幅（描画側の単一定義点）。
#[no_mangle]
pub extern "C" fn field_w() -> f32 {
    game::FIELD_W
}

/// フィールド高さ。
#[no_mangle]
pub extern "C" fn field_h() -> f32 {
    game::FIELD_H
}

/// プレイヤーの固定 X。
#[no_mangle]
pub extern "C" fn player_x() -> f32 {
    game::PLAYER_X
}

/// プレイヤー幅。
#[no_mangle]
pub extern "C" fn player_w() -> f32 {
    game::PLAYER_W
}

/// プレイヤー高さ。
#[no_mangle]
pub extern "C" fn player_h() -> f32 {
    game::PLAYER_H
}
