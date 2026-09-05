# 戦国じゃんぶる 戦闘後UI（enemy_detail中心）補足解析

作成元:
- 元SWF: `sgjbgm.swf`
- scene graph: `full_scene.json`
- 既存post-battle配布物: `sengoku_jumble_post_battle_ui_delivery`

## 1. 結論

既存の `sengoku_jumble_post_battle_ui_delivery` は大筋で正しいです。
今回の再解析で、特に次が追加で確定しました。

1. `Sprite 3312` の `st02`（enemy_detail）は **frame 3** で正しい。
2. enemy_detail の動的テキストは少なくとも以下7項目が確定。
   - `nm`（名前）
   - `lhp`（HP）
   - `lkp`（技量）
   - `lsp`（脚力）
   - `lpw`（戦闘）
   - `ldf`（防御）
   - `rkd`（禄高/俸給系表示）
3. 特殊能力欄は 16個ではなく、**`t7..t22` の16枠 + `t30,t31` の2枠 = 合計18枠**。
4. `heishu`（兵種）と `wazashu`（技種）は、フレーム切替で表示内容を変えるMovieClip。
5. `前/次` ボタンは SWF 上でも `ch.nx(0)` / `ch.nx(1)` 呼び出しになっており、既存実装方針の「端ではno-op」は妥当。
6. `この兵を登用する` は単純な確定ボタンではなく、隠しダイアログ `hkk` / `gbt` と連動する。今の「未接続」扱いのままにするのが安全。

## 2. enemy_detail の表示ツリー

`enemy_detail_active_display_list.json` に、`Sprite 3312` の frame 3 到達後のアクティブdisplay listを深度順で保存しています。
主要要素だけ抜くと次です。

- 深度 77: `nm`（名前）
- 深度 23,24,25,26,27: `lhp/lkp/lsp/lpw/ldf`
- 深度 104: `rkd`
- 深度 82: `heishu`
- 深度 84: `wazashu`
- 深度 97: `ch`（portrait、4倍表示）
- 深度 78/80: 前/次ボタン
- 深度 102: `gbt`（登用ボタン＋メッセージコンテナ）
- 深度 163: `hkk`（隠しダイアログ、初期位置は画面外）

## 3. 動的テキスト確定値

`enemy_detail_edit_text_fields.json` に保存済み。要点のみ。

| variable | 意味 | character_id | 初期値 |
|---|---|---:|---|
| `nm` | 名前 | 3243 | `--` |
| `lhp` | HP | 3238 | `50` |
| `lkp` | 技量 | 3239 | `50` |
| `lsp` | 脚力 | 3240 | `50` |
| `lpw` | 戦闘 | 3241 | `50` |
| `ldf` | 防御 | 3242 | `50` |
| `rkd` | 禄高/俸給系 | 3230 | `0` |

## 4. 作戦行動スロット（t1〜t6）

`enemy_detail_action_slot_variants.json` と `previews/actions.png` を参照。

- `t1` = 突撃
- `t2` = 守備
- `t3` = 迎撃
- `t4` = 乱戦
- `t5` = 待機
- `t6` = `??`

各スロットは複数frameを持ち、黒/茶/金などの状態違いがあります。
UI再現上は「現在選択中だけ金系、それ以外は黒系」という使い方が自然です。

## 5. 特殊能力スロット（18枠）

`enemy_detail_special_slot_variants.json` と `previews/specials1.png` / `previews/specials2.png` / `previews/extra_specials.png` を参照。

確定できた読み:
- `t7` 突進
- `t8` 攻略
- `t10` 将力
- `t11` 鉄壁
- `t19` 見切
- `t12` 母衣
- `t9` 討取
- `t13` 奮起
- `t15` 鼓舞
- `t20` 回復
- `t14` 治療
- `t16` 療所
- `t17` 仕掛
- `t18` 堅陣
- `t21` 連発
- `t22` 逃足
- `t30` / `t31` は追加2枠で、frame 1〜5 に `?? / 猛退 / 陣頭 / 火遁 / 双狩`

## 6. 兵種・技種MovieClip

### 兵種 `heishu`（sprite 2889）

`enemy_detail_unit_type_variants.json` と `previews/unit_types.png` を参照。
frame順は次です。

1. 足軽
2. 弓兵
3. 武将
4. 猛者
5. 軍師
6. 鉄砲
7. 忍者
8. 騎馬

### 技種 `wazashu`（sprite 2946）

`enemy_detail_action_type_variants.json` と `previews/action_types1.png` / `previews/action_types2.png` を参照。
かなりの数は読めましたが、一部は読みに自信がないため `?` を残しています。実装上は**フレーム番号→bitmap ID** を真のソースとして扱うのが安全です。

## 7. ボタン挙動

`enemy_detail_buttons_summary.json` を参照。

- `2867` 前ボタン: `ch.nx(0)`
- `2872` 次ボタン: `ch.nx(1)`
- `3233` 登用しない: `gotoAndStop('hchg2')`
- `3236` 敵兵一覧へ: `gotoAndStop('elst')`
- `3251` この兵を登用する: `hkk` と複数fieldを同期させた後に追加遷移

最後の `3251` はかなり重い処理で、現在ゲームへそのまま接続するのは危険です。

## 8. 実装へ反映すると良い点

1. `special_abilities_grid` は **18枠** 前提へ修正。
2. enemy detail の値差し込みキーは `nm/lhp/lkp/lsp/lpw/ldf/rkd` を正式採用できる。
3. `heishu` / `wazashu` は enum→frame 番号変換テーブルを別ファイル化すると保守しやすい。
4. `t30/t31` を既存manifestから落としているなら補完する。
5. 登用ボタンは引き続き未接続のままでよい。`

## 9. 同梱ファイル

- `enemy_detail_active_display_list.json`
- `enemy_detail_edit_text_fields.json`
- `enemy_detail_action_slot_variants.json`
- `enemy_detail_special_slot_variants.json`
- `enemy_detail_unit_type_variants.json`
- `enemy_detail_action_type_variants.json`
- `enemy_detail_buttons_summary.json`
- `hidden_recruit_replace_dialog_scene.json`
- `recruit_button_message_container.json`
- `previews/*.png`
