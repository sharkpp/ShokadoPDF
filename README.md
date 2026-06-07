# ShokadoPDF

[BentoPDF](https://github.com/alam00000/bentopdf) をベースにした、**完全オフラインで動作するスタンドアロン PDF ツール**です。
[Tauri 2](https://tauri.app/) でラップし、Windows / macOS のデスクトップアプリとして動作します（将来的に iOS / Android も想定）。

- すべての処理は端末内で完結し、ファイルが外部へ送信されることはありません。
- 主要な PDF 機能（結合・分割・変換・圧縮・抽出など）は **インターネット未接続でも利用可能**です。
- UI は BentoPDF の **simple モード**をベースに、ShokadoPDF 向けの軽微なカスタマイズを注入して構成しています。

## ライセンス

本ソフトウェアはベースの BentoPDF と同じ **AGPL-3.0**（GNU Affero General Public License v3）で提供されます。全文は [`LICENSE`](LICENSE) を参照してください。
ソースの公開を前提とした構成です（クローズドソースで配布する場合は BentoPDF の商用ライセンスが別途必要です）。

## フォルダ構成

```
ShokadoPDF/
├── core/          # BentoPDF 本体（git subtree, AGPL-3.0。原則として無改変）
├── src-tauri/     # Tauri (Rust)。ウィンドウ生成・ダウンロード通知・customize.js 注入
│   ├── customize.js     # 注入する UI カスタマイズ（core を編集せず実行時に DOM 調整）
│   ├── shokado-icon.svg # 松花堂弁当モチーフのアプリアイコン元データ
│   └── icons/           # tauri icon で生成した各プラットフォーム用アイコン
├── scripts/       # 補助スクリプト（オフライン回帰テスト・スクショ生成）
├── tests/offline/ # オフライン回帰テスト用ハーネス
├── docs/screenshot/ # 全到達可能ページのスクリーンショット
├── LICENSE        # AGPL-3.0
├── SPEC.md        # 仕様
└── package.json   # Tauri CLI と各種スクリプト
```

## 必要環境

- Node.js 20+ / npm
- Rust ツールチェーン（`rustup`、stable）
- macOS でのビルド: Xcode（iOS 含む場合）
- 動作確認・スクショ生成: システムにインストールされた Google Chrome / Chromium

## セットアップ

```bash
# ルートの依存（Tauri CLI 等）
npm install
# BentoPDF 本体の依存
npm --prefix core install
```

Rust は `rustup` で stable を導入し、`cargo` を PATH に通してください。

```bash
export PATH="$HOME/.cargo/bin:$PATH"
```

## 開発・ビルド

| コマンド | 内容 |
|---|---|
| `npm run dev` | デスクトップアプリを開発起動（`tauri dev`、simple モード + ブランド設定で core をビルド） |
| `npm run build` | デスクトップ配布ビルド（`tauri build`） |
| `npm run test:offline` | オフライン動作（同梱 WASM での実 PDF 処理）と UI カスタマイズの回帰テスト |
| `npm run screenshots` | 到達可能な全ページのフルページ・スクリーンショットを `docs/screenshot/` に生成 |
| `npm run ios:dev` / `npm run android:dev` | モバイル開発起動（要 Xcode / Android Studio） |

ビルドは simple モード + ブランド名を環境変数で指定して実行されます（`SIMPLE_MODE=true VITE_BRAND_NAME=ShokadoPDF`）。

## オフライン対応（同梱 WASM）

主要な PDF 処理エンジン（PyMuPDF / Ghostscript / CoherentPDF）を CDN ではなくローカルに同梱し、`/wasm/*` から配信します（`core/vite.config.ts` の `viteStaticCopy` と `core/.env.production` を参照）。
OCR（Tesseract）や CJK フォント、デジタル署名のタイムスタンプ局（TSA）など本質的にオンラインが必要な機能は同梱対象外です。

## UI カスタマイズ方針

`core/`（BentoPDF）は **原則無改変**とし、ShokadoPDF 固有の調整は `src-tauri/customize.js` を Tauri の initialization script として注入することで実現しています（ブランド名のみ `VITE_BRAND_NAME` で設定）。主な内容:

- ブランド表記・アイコンを ShokadoPDF（松花堂弁当モチーフ）に
- ヘッダに「ホーム」「ShokadoPDFについて」リンクを追加（表示言語に追従）
- フッタの著作権・バージョン表記・言語切替を調整
- 各ツールページの「Back to Tools」削除、余白の最適化 など

## BentoPDF 本体の更新取り込み

`core/` は git subtree です。上流の更新は次で取り込めます。

```bash
git subtree pull --prefix=core https://github.com/alam00000/bentopdf.git main --squash
```

## クレジット

本プロジェクトは [BentoPDF](https://github.com/alam00000/bentopdf)（AGPL-3.0）に基づいています。BentoPDF の作者・コントリビューターに感謝します。
