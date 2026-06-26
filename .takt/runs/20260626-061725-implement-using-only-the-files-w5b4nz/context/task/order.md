# タスク仕様

## 目的

playground サイト（ナナオのあそびば）に、テーマ「自由」の新規ページ「自由律俳句ジェネレーター」を追加する。コアロジック（語彙の組み合わせ・韻律スコア・乱数）を **Rust** で実装して **WebAssembly** 化し、フロントエンド完結で動かす。「自由」は *自由律*（5-7-5 の定型に縛られない俳句）として解釈する。

## 要件

- [ ] Rust ソースをリポジトリ内に配置する（例: `wasm/free-haiku/`）。JIYU GACHA はソースを残さず再ビルド不能になった反省を踏まえ、ソースとビルドスクリプトを必ずコミットする
- [ ] Rust クレートを `crate-type = ["cdylib", "rlib"]` で構成し、`wasm32-unknown-unknown` 向けにビルドできる（wasm-bindgen 不要、`extern "C"` で整数のみ受け渡し）
- [ ] 俳句生成のコアロジックを純粋関数として実装する（語彙バンクからの選択、自由律の句構成、韻律/字数のスコアリング）。決定的 PRNG（シード可能）も実装する
- [ ] `cargo test` でコアロジックの単体テストを用意する（PRNG の決定性・範囲、句構成の妥当性、分布）
- [ ] React ページ `src/components/pages/FreeHaiku.tsx` を追加し、既存の `JiyuGacha.tsx` と同様に `@/assets/*.wasm?url` で WASM を読み込む（`instantiateStreaming` ではなく fetch→arrayBuffer→instantiate）
- [ ] `src/App.tsx` のルーティング（`/haiku`）と作品一覧 `PROJECTS` に登録する
- [ ] CSS はページ単位にスコープし他ページへ漏れないようにする（例: `.fh-root` 配下にネスト）
- [ ] 生成した俳句の再生成・コピー・お気に入り/履歴（localStorage）を備える
- [ ] 既存ページ（除夜の鐘 `/joya`・チャット `/chat`・JIYU GACHA `/gacha`）の表示・ルーティングに影響を与えない

## 受け入れ基準

- `npm run build`（= `vite build`）が成功し、俳句生成 wasm が `dist/assets` にバンドルされる
- `cargo test` がパスする（コアロジックの単体テスト）
- `/haiku` で俳句を生成・再生成でき、テーマ「自由（自由律）」を体現している
- 既存ページのルーティング・表示が壊れていない
- Rust ソースとビルドスクリプトがリポジトリにコミットされ、wasm を再生成できる

## 参考情報

- 既存の Rust→WASM ページ実装が手本になる: `src/components/pages/JiyuGacha.tsx`、コンパイル済み `src/assets/gacha_core.wasm`
- WASM ロードは S3/CloudFront 配信で content-type 非依存にするため、`fetch(url).arrayBuffer()` 経由で `WebAssembly.instantiate` する。コアは外部 import を持たず空オブジェクトでインスタンス化できる構成にする
- ビルドは追加ツール不要（rustup + cargo のみ）。この端末は Homebrew 版 rustc が PATH を奪うため、ビルドスクリプトで rustup ツールチェインの bin を前置きして wasm の std を解決すること
- 既存の `build`/`__build`/`deploy` スクリプト（`package.json`）の流儀を踏襲する。リリースは `release: vX.Y.Z` コミット＋同名タグの運用
- テーマ「自由」= 自由律。季語や定型（5-7-5）に縛られず、語彙の自由な組み合わせで詩情を生む
