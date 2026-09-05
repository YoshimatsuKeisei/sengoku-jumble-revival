# 戦国じゃんぶる Effect Runtime Package

分類用ZIPの重複PNGをゲームへ入れずに済むよう、元素材141枚を無加工・無トリミング・無回転で可変サイズのテクスチャアトラスへ格納した実装用パッケージ。

## 収録内容

- Atlas PNG: 3枚
- Atlas region: 141（元Bitmap 141枚を各1回のみ収録）
- 論理Effect系列: 33
- 自動使用可能な系列: 24
- 兵種×技種: 29フォルダ相当（技コード1～28、治癒は2兵種）

## ファイル

- `atlases/*.png`: 実際に読み込む画像。フレーム単位PNGはアプリへ入れない。
- `effect_atlas.json`: Bitmap IDからAtlas切り出し矩形への対応。
- `effect_sequences.json`: Effectごとのフレーム順、SWF保持フレーム、24fps、配置行列。
- `action_effect_map.json`: 兵種＋技コードからcaster/projectile/hit Effectを引く対応表。
- `action_effect_map.csv`: 技対応の人間向け一覧。
- `CODEX_IMPLEMENTATION_SPEC.md`: 既存戦闘画面へ統合する際の仕様。

## 重要

`effect_sequences.json.frames`だけを一定間隔で回さず、`timeline_playback`を24fpsで進める。同一Bitmapを保持するフレームや透明フレームが含まれるためである。

各Atlas領域は元PNGとRGBA画素単位で一致する。透明余白を切り詰めていないため、元サイズと基準位置が変わらない。Canvasでは`imageSmoothingEnabled = false`を使用する。

`runtime_enabled: false`の9系列は元SWFで技・兵種の呼出し先を確定できなかったもの。Atlasには保全しているが、自動再生してはいけない。
