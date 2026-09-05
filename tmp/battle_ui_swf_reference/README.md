# 戦国じゃんぶる 本家戦闘UI・Timeline調査

## 結論

本家の戦闘UIは380×380px・24fpsで、root frame 14（`gmain`）に戦闘中HUDを置き、rootが同frameに停止している間だけ表示します。静止画を固定配置するだけでは再現できず、少なくとも`ma`/`ea`、`uwd`、`kalt`、`trm`、`kpb`、`htbr`は独立MovieClipの状態またはフレームを制御します。

最重要の訂正は、左右の青赤帯`ma`/`ea`が生存兵数の常時ゲージではなく、`cma(message)`/`cea(message)`から再生される**左右別の動的イベント通知欄**だという点です。討ち取り、戦線離脱、陣地攻撃、堅陣、療所、一時退避などの文章を動的Text `cm`へ入れ、44f（1.833秒）だけ表示します。

## Root上の戦闘画面

| root frame | label | 内容 |
|---:|---|---|
| 13 | `inmv` | 戦場・開始演出`bk`・進行表示`kalt`を配置。HUD文字を初期化 |
| 14 | `gmain` | active HUDを配置。通常戦闘中はここで停止 |
| 15 | `gset` | 結果用の演出を再配置 |
| 16 | — | HUD・戦場関連を一括remove |

正確な深度・座標は`root_frame14_layout.csv`を参照してください。すべてSWFステージ左上原点です。

## 動くUIの正確な挙動

### PLAYER/ENEMY動的イベント通知 `ma` / `ea`

- `cma(message)` / `cea(message)`が内部文字列`cm`との差を検知した時だけ、`cm=message; gotoAndPlay(2)`。
- 同じ文が連続した場合は再始動しません。別文が再生中に来た場合はframe2から再始動します。本家に複数toastの積み上げqueueはありません。
- frame 1は`_visible=false; stop()`。
- frame 2で可視化。
- frame 3–6で画面外から進入し、同時に白フラッシュから通常色へ戻る。
- frame 6–45は完成位置で保持。
- frame 45後にframe 1へ戻って非表示・停止。
- 可視時間は44f = 1.833秒。
- PLAYER側は左からstage x=-2へ、ENEMY側は右からstage x=186へ入る。
- PLAYER側Text `cm`: nominal stage(23,37)、field bounds(21,35)–(187.95,50)。
- ENEMY側Text `cm`: nominal stage(197,37)、field bounds(195,35)–(361.95,50)。

確認できた文型：

| 側 | ActionScript | 文型 |
|---|---|---|
| PLAYER/左 | `cma` | `battle_intro_and_result_bk が戦線離脱！`、`★battle_intro_and_result_bkの堅陣発動！`、`★自陣が攻略されています！`、`★自陣が攻撃されています！`、`battle_intro_and_result_bkの療所効果！`、`battle_intro_and_result_bk 一時退避！` |
| ENEMY/右 | `cea` | `★battle_intro_and_result_bkの堅陣発動！`、`★battle_intro_and_result_bk が敵陣を攻略！`、`★battle_intro_and_result_bk が敵陣を攻撃！`、`battle_intro_and_result_bk 討ち取ったり！` |

フレーム別の全depth、座標、alpha、color transformは`timelines/player_event_notice_ma.csv`と`enemy_event_notice_ea.csv`にあります。

### 下部メッセージ制御 `uwd`

`uwd`はstage(343,343)に置かれますが、メッセージ本体Sprite2526をlocal(-345,37)から動かすため、完成位置はstage(-2,340)です。

| 区間 | frame | 挙動 | 時間 |
|---|---:|---|---:|
| 初期 | 1 | 終了ボタン表示・待機 | 無期限 |
| stta開始 | 2 | ボタンを外す | — |
| 進入 | 3–13 | y=380から340へ上昇 | 0.458秒 |
| 保持 | 13–97 | 完成位置 | 3.542秒 |
| 退場 | 98–107 | 終了ボタンを先に戻し、panelはy=380へ下降 | 0.417秒 |
| 終了 | 108 | panel除去、`gotoAndStop(1)` | — |

`gotoAndPlay("stta")`ならframe2–108の107f = 4.458秒です。`gotoAndStop("sttb")`はframe13の完成位置へ即時ジャンプし、外部遷移まで保持します。

### メッセージstate

| state | 内容 | 再生方式 |
|---:|---|---|
| 1 | 初回操作説明＋PLAYER/技能クリック案内 | 初回temporary |
| 2 | 敵陣攻撃不可 | `sttmc=2; stta` |
| 3 | 味方減少・退避警告 | `sttmc=3; stta` |
| 4 | 退避警告 | `sttmc=4; stta` |
| 5 | 終了確認 | exit buttonから開始、操作待ち |
| 6 | 自陣陥落 | `sttmc=6; sttb`で即時・停止保持 |
| 7 | 敵陣陥落 | `sttmc=7; sttb`で即時・停止保持 |
| 8 | 優勢勝ち＋全画面終了演出 | 構造確定、直接trigger未確定 |

初回のPLAYER/技能クリック案内Sprite2498は5f待ってframe6から現れ、frame7–11でfade-in、frame11–81保持、frame82–84 fade-out、frame85でremove+stopします。可視79f=3.292秒で、READY状態への常時連動ではありません。

### 終了ボタンと確認

- 終了ボタン: stage(343,343)、34×36。clickで`sttmc=5; gotoAndPlay("stta")`。
- YES: stage(201,350)。`edrsn=1`を設定し、`gtm>1`なら1へ変更後、`sttc`で退場。
- NO: stage(269,350)。`sttc`で退場。
- YESが左、NOが右です。

### 戦闘進行 `kalt`

- frame1–13: ルール注意2532をfade-in。
- frame13–152: 保持。
- frame153–165: fade-out。
- frame166: removeしてstop。ここまで166f=6.917秒。
- frame167系列: モード注意2535/2537をfade-in→保持→fade-outしframe244で除去。
- frame246: 勝ち抜き人数2540＋`n1/n2`を表示してstop。`tiky`/`atck`が値更新。
- `sgyomd==2`ならlabel `sch`へ分岐し、frame249で成長残人数2545＋`n1/n2`を表示してstop。

正確なalpha推移は`timelines/battle_progress_kalt.csv`にあります。

### 下部ステータス

- 背景2571はstage(-2,340)に常駐。
- 右側はActionScript関数`d`/`atck`の対象を表示し、`tnm/thp/tpw/tdf/tmp/ts`を更新。
- `trm.gotoAndStop(target.e)`でframe1=自/味方、frame2=敵。
- 左側`mnm/mhp/mpw/mdf`と`kpb`は初期化・構造までは確認したが、更新元は今回抽出できたframe DoActionだけでは未確定です。
- `kpb`は100段階で内部バー位置が変わるため、CSS transitionの自動アニメではなく、値を1–100へ量子化して該当frameを表示する実装が本家に近いです。

### `htbr`

stage(2,20)の約200×4px非Bitmap morphです。600frameを二つのmorph区間で変化させ、frame1はstopします。残り時間との対応は有力ですが、外部からどの値で`gotoAndStop`されるかを確定できなかったため、**timer barと断定していません**。

### 戦闘開始・結果演出 `bk` / Sprite2531

- root frame13でstage(0,0)へ配置される開始側はframe1から再生し、frame96 label `ging`でstopします。96f=4.0秒です。
- root frame15で使う結果側はlabel `maku`=frame97からframe160まで64f=2.667秒です。
- frame160 ActionScriptは`edrsn`とモード状態を見て結果先を分岐します。
- 複数のmorph、VS枠、人物・装飾、下部panelをdepth別に制御します。全frameの行列、alpha、ratioは`timelines/battle_intro_and_result_bk.csv`へ残しました。
- 背景Bitmap2463は現在のcategorized素材に無いため、既存Atlasだけでは開始演出を完全再現できません。欠けたまま推測描画しないでください。

## 素材参照

使用画像の元フォルダは既存の`sengoku_jumble_play_ui/`、実装時の論理キーは`assets/battlefield_panel/config/atlas_manifest.json`準拠です。Bitmap IDごとの両対応は`battle_ui_timeline_manifest.json`の`asset_paths_by_bitmap_id`に格納しました。静止画の再加工・リサイズ・生成はしていません。

## 未確定事項

1. 左側ステータスの更新呼出し元。
2. `htbr`へ渡される実値。
3. message state8の直接trigger。
4. `ami`は空Spriteで、可視実装は不要と考えられるが役割名は不明。

未確定部分は推測で現実装へ接続せず、イベントログまたは追加AVM1 ClipAction解析で確認してください。

## 同梱ファイル

- `battle_ui_timeline_manifest.json`: 構造化された結論・座標・trigger・confidence
- `ui_elements.csv`: 何が/いつ/どこ/何frame/どう動く/どう消えるかの一覧
- `root_frame14_layout.csv`: active HUDのdepthとroot座標
- `timelines/*.csv`: 主要MovieClipの全frame状態
- `raw_button_actions.json`: DefineButton2の実レコードとAVM1 action
- `codex_handoff.md`: そのまま渡せる実装修正指示
- `previews/*.png`: 画面配置・主要タイムライン確認用
