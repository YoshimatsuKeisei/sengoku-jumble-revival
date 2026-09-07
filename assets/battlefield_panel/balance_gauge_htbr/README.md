# 戦況ゲージ htbr 抽出物

本家 `sgjbgm.swf` の Sprite 2609 (`htbr`) を、SWF内のShape/MorphShape定義から再構成したものです。
新規デザインではありません。

- 本家配置: x=2, y=20
- 論理サイズ: 200×4 px
- 600 frame
- frame 1 = 敵側へ最大
- frame 300 = 互角
- frame 600 = 自軍側へ最大
- 青: RGB(44,147,255)
- 赤: RGB(231,21,0)
- 中央に1px黒区切り
- 下側1pxにalpha=69の黒シェード

`battle_balance_gauge_600frames.png` は縦方向spritesheetです。
frame N は y=(N-1)*4 から4px分です。

実装ロジック:
htpt1 = mcp*5 + mmb*3 + eth
htpt2 = ecp*5 + emb*3 + mth
bf = clamp((htpt1 - htpt2 + 30)*10, 1, 600)
mf = mf + (bf - mf)/8
表示frame = round(mf)
