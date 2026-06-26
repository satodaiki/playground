//! LEAP TO FREEDOM のコア（重力反転ランナー）。
//!
//! 純粋ロジックは `rng` / `game` モジュールに閉じ、`cargo test` で単体検証する。
//! WASM へは `extern "C"` の整数/浮動小数 ABI を公開する（wasm-bindgen 不要・
//! 外部 import なし）。描画に属する色やラベルは TS 側に置き、ここは数値状態に徹する。

pub mod game;
pub mod rng;

use core::ptr::{addr_of, addr_of_mut};

use game::World;

// 単一スレッドの WASM 実行を前提に、ワールドを静的に保持する。
// static mut への参照は static_mut_refs lint（将来エラー）対象のため、
// 生ポインタ経由（addr_of/addr_of_mut）でアクセスする。
static mut WORLD: World = World::EMPTY;

/// 指定シードで世界を初期化する。ゲーム開始時にフロントから呼ぶ。
#[no_mangle]
pub extern "C" fn init(s0: u32, s1: u32) {
    unsafe {
        *addr_of_mut!(WORLD) = World::new(s0, s1);
    }
}

/// 現在のシード状態へ巻き戻して再開する。
#[no_mangle]
pub extern "C" fn reset() {
    unsafe {
        (*addr_of_mut!(WORLD)).reset();
    }
}

/// 重力の向きを上下反転する（ワンボタン入力）。
#[no_mangle]
pub extern "C" fn flip() {
    unsafe {
        (*addr_of_mut!(WORLD)).flip();
    }
}

/// 世界を `dt_ms` ミリ秒進める。
#[no_mangle]
pub extern "C" fn tick(dt_ms: f32) {
    unsafe {
        (*addr_of_mut!(WORLD)).tick(dt_ms);
    }
}

/// プレイヤー矩形の上端 Y 座標。
#[no_mangle]
pub extern "C" fn player_y() -> f32 {
    unsafe { (*addr_of!(WORLD)).player_y() }
}

/// プレイヤーの縦速度（px/ms）。
#[no_mangle]
pub extern "C" fn player_vel() -> f32 {
    unsafe { (*addr_of!(WORLD)).player_vel() }
}

/// 画面内の障害物数。
#[no_mangle]
pub extern "C" fn obstacle_count() -> u32 {
    unsafe { (*addr_of!(WORLD)).obstacle_count() }
}

/// `i` 番目の障害物 X。
#[no_mangle]
pub extern "C" fn obstacle_x(i: u32) -> f32 {
    unsafe { (*addr_of!(WORLD)).obstacle_x(i) }
}

/// `i` 番目の障害物 Y。
#[no_mangle]
pub extern "C" fn obstacle_y(i: u32) -> f32 {
    unsafe { (*addr_of!(WORLD)).obstacle_y(i) }
}

/// `i` 番目の障害物の幅。
#[no_mangle]
pub extern "C" fn obstacle_w(i: u32) -> f32 {
    unsafe { (*addr_of!(WORLD)).obstacle_w(i) }
}

/// `i` 番目の障害物の高さ。
#[no_mangle]
pub extern "C" fn obstacle_h(i: u32) -> f32 {
    unsafe { (*addr_of!(WORLD)).obstacle_h(i) }
}

/// 生存距離＝スコア。
#[no_mangle]
pub extern "C" fn score() -> u32 {
    unsafe { (*addr_of!(WORLD)).score() }
}

/// ゲームオーバーなら 1、プレイ中なら 0。
#[no_mangle]
pub extern "C" fn is_over() -> u32 {
    unsafe { (*addr_of!(WORLD)).is_over() as u32 }
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
