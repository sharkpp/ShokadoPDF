# 仕様

## 概要

ShokadoPDF は、オープンソースの [BentoPDF](https://github.com/alam00000/bentopdf)（AGPL-3.0）をベースに、[Tauri 2](https://tauri.app/) でラップしたスタンドアロンの PDF ツールアプリ。

- すべての処理を端末内（WebView 内）で完結し、ファイルを外部送信しない。
- 主要 PDF 機能（結合・分割・変換・圧縮・抽出 等）はオフラインで動作。
- ライセンスは BentoPDF と同じ **AGPL-3.0**。

## 技術スタック

- フロントエンド: BentoPDF（TypeScript + Vite + Tailwind CSS）。**simple モード**でビルド。
- ネイティブシェル: Tauri 2（Rust）。OS の WebView 上でフロントを描画。
- PDF 処理（WASM, ローカル同梱）: PyMuPDF / Ghostscript / CoherentPDF、pdf.js / pdf-lib / qpdf-wasm 等。
- ブランド設定: ビルド時環境変数 `VITE_BRAND_NAME=ShokadoPDF`、`SIMPLE_MODE=true`。
- UI 調整: `src-tauri/customize.js` を Tauri initialization script として注入（core は無改変）。
- 補助ツール: puppeteer-core（オフライン回帰テスト・スクショ生成）。

### 対象プラットフォーム

- Windows / macOS（デスクトップ）— 現行。
- iOS / Android（モバイル）— Tauri 2 で対応予定（`npm run ios:dev` / `android:dev`）。

## フォルダ構成

| パス | 役割 |
|---|---|
| `core/` | BentoPDF 本体（git subtree, prefix=`core`）。原則無改変 |
| `src-tauri/` | Tauri（Rust）。ウィンドウ生成・ダウンロード保存パス通知・`customize.js` 注入 |
| `src-tauri/customize.js` | 注入する UI カスタマイズ（DOM 調整・言語連動・FOUC ガード等） |
| `src-tauri/shokado-icon.svg`, `icons/` | 松花堂弁当モチーフのアイコン（元 SVG と生成物） |
| `scripts/` | `offline-regression.mjs`（回帰テスト）, `screenshot-pages.mjs`（スクショ生成） |
| `tests/offline/` | オフライン回帰テスト用ハーネスとサンプル PDF |
| `docs/screenshot/` | 到達可能な全ページのスクリーンショット |
| `LICENSE` | AGPL-3.0 |

## 画面

- **トップページ**: ツール一覧（検索 + カテゴリ別グリッド）。ヘッダ＝ブランド + 「ShokadoPDFについて」、フッタ＝著作権 + バージョン + 言語切替。
- **各ツールページ**: タイトル + 説明 + アップローダ（ドラッグ&ドロップ / クリック選択）+ 「仕組み」。ヘッダに「ホーム」「ShokadoPDFについて」。
- **PDF マルチツール / フォーム作成 等のエディタ系**: 専用ツールバー UI。他ページとヘッダ表記を統一。
- **ShokadoPDFについて**: 本アプリの説明（about ページを ShokadoPDF 独自内容に差し替え）。

## カスタマイズ要点（customize.js）

- ブランド表記・アイコンを ShokadoPDF（松花堂弁当モチーフ）へ。
- ヘッダに「ホーム」（トップでは非表示）「ShokadoPDFについて」を追加し、表示言語に追従して翻訳。
- フッタ: 著作権「© 2026 sharkpp. All rights reserved.」/ バージョンをアプリ版数 / 言語切替（21言語）。
- 各ページの「Back to Tools」削除、アップローダ周辺の余白最適化。
- 表示前にコンテンツを一時非表示にする FOUC ガード（読込時のちらつき防止）。

## オフライン方針

- Tier1（コア PDF 処理: PyMuPDF / Ghostscript / CoherentPDF）をローカル同梱し `/wasm/*` から配信。
- OCR・CJK フォント・タイムスタンプ局（TSA）等のオンライン必須機能は同梱対象外。

## 配布・ライセンス

- AGPL-3.0（ソース公開前提）。`core/` 由来のため上流と同一ライセンスを維持。
- 上流取り込み: `git subtree pull --prefix=core https://github.com/alam00000/bentopdf.git main --squash`。
