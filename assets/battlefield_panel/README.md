# battlefield_panel runtime assets

このフォルダはプロジェクト直下へ配置する実装専用セットです。ZIPをプロジェクト直下で展開すると、`assets/battlefield_panel/`が作成されます。

## 収録物

- `atlas/hud_atlas.png`: 常駐HUD、下部ステータス、終了ボタン
- `atlas/messages_atlas.png`: 操作説明、警告、通知、終了確認、勝敗・進行表示
- `atlas/intro_atlas.png`: 戦闘開始演出の任意読み込み素材
- 各`*_atlas.json`: Bitmapの切り出し矩形とlogical alias
- `config/atlas_manifest.json`: アプリ側で使う統合対応表
- `config/panel_layout.json`: 380×380基準の配置表。参照先はlogical asset IDへ変換済み
- `config/dynamic_text_fields.json`: 人数、時間、名前、HP、能力値、動的通知文
- `config/non_bitmap_components.json`: HPバー等、元SWFでBitmapではなかった部品

原本PNG、Contact Sheet、CSV、検証用Previewは容量削減のため収録していません。必要な場合は参照用の`sengoku_jumble_play_ui.zip`を使用してください。

## 取得方法

1. `config/atlas_manifest.json`の`assets[logicalAssetId]`を読む
2. `atlas`と`frame`を取得する
3. 対応する`atlas/*_atlas.json`の`frames[frame].frame`から`x/y/w/h`を読む
4. `drawImage(atlasImage, x, y, w, h, dx, dy, w, h)`で描画する

同じBitmapを複数用途で使う場合も、logical asset IDは用途別に用意されています。例えばPLAYER/ENEMYの警告アイコンは別IDですが、同一の`bitmap_2565`領域を参照します。通知背景Bitmap 2499も警告・終了確認・戦闘終了で同じ領域を共有します。

## 描画上の注意

- Canvasの`imageSmoothingEnabled`は`false`
- CSSで拡大する場合は`image-rendering: pixelated`
- アトラス内の画像は回転・trim・リサイズしていない
- 各領域の周囲に2pxの透明paddingあり
- 元の透明余白を含む画像寸法が`sourceSize`にそのまま保存されている

討ち取り・戦線離脱などの名前付き通知は完成PNGではありません。`messages_atlas`内の通知背景と、`dynamic_text_fields.json`内の文型を使って実行時に文字を重ねてください。

戦闘開始演出の背景Bitmap 2463は入力された`categorized.zip`に無かったため、`intro_atlas`にも含まれていません。常駐HUDには影響しません。
