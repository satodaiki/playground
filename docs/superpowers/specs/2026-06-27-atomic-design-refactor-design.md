# ページコンポーネントのアトミックデザイン分解 — 設計書

- 日付: 2026-06-27
- 対象: `src/components/pages/{JiyuGacha,FreeHaiku,LeapToFreedom}.tsx`（各 ~300–340 行）
- 目的: 一枚岩のページコンポーネントを、アトミックデザインに倣って小さな
  責務に分解し可読性を上げる。あわせて非UIロジック（データ・ヘルパ・WASM
  ロード）を分離する。

## 背景 / 課題

- 各ページが 300–340 行で、データ定義・WASM 型・ヘルパ関数・描画ロジック・
  状態機械・JSX を 1 ファイルに抱えている。
- 3 ページが `fetch(url) → arrayBuffer() → WebAssembly.instantiate(buf, {})`
  の WASM ロードをそれぞれ重複実装している。
- `readList/writeList`（gacha・haiku）、`makeSeed`（3ページ）が重複。
- お気に入り/履歴のサイドパネルが gacha・haiku でほぼ同一構造。

## 決定事項（ユーザー承認済み）

1. **共有範囲はハイブリッド**: 汎用アトムは共有（className/variant で各ページの
   スコープCSSに対応）、ページ固有の見た目は organism として各ページ配下に置く。
2. **UI + 非UIロジック両方を分離**: JSX のコンポーネント化に加え、データ・
   ヘルパ・WASM 型・WASM ロード（`useWasm`）を別モジュールへ抽出する。

## 不変条件（最重要）

抽出後も **DOM 構造と className を完全に維持する**。ページスコープCSS
（`jg-`/`fh-`/`ltf-` 接頭辞）はクラス名と入れ子構造に依存しているため、ここを
変えなければ表示は不変。既存の 13 フロントエンドテスト（`src/test/`）がこの
不変条件の安全網となる（挙動を変えない REFACTOR）。CSS ファイルは変更しない。

## ディレクトリ構成

```
src/
├── hooks/
│   └── useWasm.ts                 # 共通 WASM ロード。{exports, status} を返す
├── lib/
│   ├── storage.ts                 # readList/writeList(gacha・haiku 共通)
│   └── seed.ts                    # makeSeed(3ページ共通)
├── components/
│   ├── atoms/
│   │   ├── BackLink.tsx           # ← トップに戻る(className prop)
│   │   └── PageFooter.tsx         # フッタ(children/text + className)
│   ├── molecules/
│   │   └── ListPanel.tsx          # お気に入り/履歴(gacha・haiku 共通, renderItem)
│   └── pages/
│       ├── JiyuGacha.tsx          # 組み立てに徹する薄い層
│       ├── JiyuGacha.css          #（変更なし）
│       ├── jiyu-gacha/
│       │   ├── data.ts            #   CATEGORIES, RARITIES
│       │   ├── draw.ts            #   WasmExports型, draw(), ideaText, rarityMeta, types
│       │   ├── Hero.tsx
│       │   ├── GachaMachine.tsx   #   organism(筐体+レバー)
│       │   └── ResultCard.tsx     #   organism(結果カード)
│       ├── FreeHaiku.tsx
│       ├── FreeHaiku.css          #（変更なし）
│       ├── free-haiku/
│       │   ├── data.ts            #   BANKS
│       │   ├── compose.ts         #   WasmExports型, generate(), poemText/oneLine, types
│       │   ├── Hero.tsx
│       │   └── PoemStage.tsx      #   organism(紙面+メタ+操作)
│       ├── LeapToFreedom.tsx
│       ├── LeapToFreedom.css      #（変更なし）
│       └── leap-to-freedom/
│           ├── constants.ts       #   COLORS, WasmExports型, MAX_DT_MS, HIGHSCORE_KEY, types
│           ├── render.ts          #   draw()
│           ├── Hero.tsx
│           └── GameBoard.tsx      #   organism(canvas+rAFループ+オーバーレイ)
```

## 共通フック `useWasm<T>(url)`

```ts
type WasmStatus = 'loading' | 'ready' | 'error';
function useWasm<T>(url: string): { exports: T | null; status: WasmStatus };
```

- 中身: `fetch(url) → arrayBuffer() → WebAssembly.instantiate(buf, {})`。
  cancel ガード（アンマウント時の setState 抑止）を内包。失敗時 `console.error`
  の上 `status='error'`。
- 各ページの使い方:
  - gacha/haiku: `status==='ready'` を従来の `ready`、`'error'` を `error` に対応。
  - leap: `status` を初期 phase（loading/error/ready）に対応させ、playing/over は
    ページ側でローカル管理（ゲーム状態は WASM ロードと別軸のため）。

## 共有モジュール / 部品

- `lib/storage.ts`: `readList(key): Entry[]` / `writeList(key, list)`。型は
  ジェネリック（`<T>`）にして gacha/haiku 双方の Entry に対応。
- `lib/seed.ts`: `makeSeed(): [number, number]`。
- `atoms/BackLink.tsx`: `props { className: string }`。`<Link href="/"><a class=...>`。
- `atoms/PageFooter.tsx`: `props { className: string; children }`。
- `molecules/ListPanel.tsx`: `props { className接頭辞, title, items, emptyText,
  renderItem, onClear? }`。gacha・haiku のお気に入り/履歴を表現。className は
  各ページのスコープに合わせて prop で受ける。

## アトミックデザイン対応

- atoms: BackLink, PageFooter（共有）
- molecules: ListPanel（共有）、各 Hero、leap の HUD 等
- organisms: GachaMachine/ResultCard、PoemStage、GameBoard
- pages/templates: 上記を組み立てる薄い層

## テスト方針

- 既存 13 テスト（`src/test/`）を各分解ステップ後に実行し緑を維持。DOM/クラスを
  保つので原則そのまま緑。
- 共有部品に軽い単体テストを追加:
  - `useWasm`: ready/error の status 遷移（fetch を実 .wasm/失敗でスタブ）。
  - `ListPanel`: items 表示 / empty 表示 / onClear。
- 出力はクリーンに保つ（エラーパスの `console.error` は spy で抑止）。

## 実装ステップ（各ステップでテスト緑を確認）

1. 共有基盤: `lib/storage.ts`, `lib/seed.ts`, `hooks/useWasm.ts`,
   `atoms/BackLink.tsx`, `atoms/PageFooter.tsx`, `molecules/ListPanel.tsx`
   ＋ それぞれの単体テスト。
2. gacha 分解（data/draw/Hero/GachaMachine/ResultCard + ページ薄層化）→ 緑。
3. haiku 分解（data/compose/Hero/PoemStage + 薄層化）→ 緑。
4. leap 分解（constants/render/Hero/GameBoard + 薄層化、useWasm 統合）→ 緑。
5. `npm run build` 成功と 3 ページの目視（スクショ）確認。

## スコープ外（YAGNI）

- ページスコープCSS の統合・リネーム（不変条件を守るため触らない）。
- アクション系ボタンの汎用 Button 化（重複が小さく、organism 内に留める）。
- 既存ページ以外（joya/chat）の改修。
