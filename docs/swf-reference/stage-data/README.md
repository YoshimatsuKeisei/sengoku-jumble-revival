# 戦国じゃんぶる 本家SWF 敵軍・兵生成データ抽出（full work）

Source: recovered `sgjbgm.swf` / AVM1.

- SWF SHA-256: `47d397d98ed797e2e5e1f7f96c10ba9c3f93d3a3b54b45fbc61401a553c3399c`
- Flash 7 / 380×380 / 24fps

## 確定した主要構造
- `mpst()` : 17×17全体マップ上の拠点カテゴリ座標
- `mpcm()` : 各座標の敵軍名・formation id (`efm`)・Lv、`elv = Lv*5-10`
- `fmdt()` : formation idごとの180桁固定文字列 = 30人×6桁 `XX YY class strategyRaw`
- 戦闘セットアップ `shk()` : `worldX=1833-XX*36`, `worldY=YY*36`; raw strategyを内部stateへ変換
- `chpr()` : 一般兵の名前・技種・能力・特殊能力の乱数生成
- `pstch()` : 有名兵の固定上書き

## 重要な注意

### 表示Lvと内部補正
画面のLv数字をそのまま能力に足すのではありません。`mpcm()` は `elv = Lv*5-10` を設定し、一般兵生成 `chpr()` が戦闘・防御・技量（忍者以外は体力にも）加算します。Lv1=-5, Lv2=0, ... Lv9=35, internal Lv10=40。

### 作戦rawコード
`0=乱戦, 1=突撃, 3=守備, 4=待機, 8=迎撃`。raw3/8の日本語対応は、有名兵固定slotとアーカイブ済み作行データでも相互確認しています。詳細は `validation/strategy_mapping_evidence.md`。
### named stageの兵種構成
拠点カテゴリ2～7（有名軍を含む）は `mppt != 0` のため、今回確認した平地用騎馬差し替えの対象外。`fmdt` の30人兵種構成を固定編成として扱えます。

### 普通の平地 Lv4以上
`shk()` に後処理があります。`mppt==0 && tklv>3` の通常平地では、raw作戦が突撃(1)または乱戦(0)のslotについて10%で `ch=8` 騎馬、`p=2` 突撃へ変換されます（裏戦国efm129は除外）。したがって平地の最終兵種人数は完全固定ではありません。

### 技種人数
有名兵の直接指定分は固定。一方、雑兵は `chpr()` で技種を抽選するため、ステージの「技種○人」は通常は固定値ではありません。`named_stage_technique_expectations.*` は期待値です。

### pstchの原版バグ/異常
`pstch()` には少なくとも2箇所、技種代入先slotが不自然な箇所があります。`validation/pstch_anomalies.json` を参照。値を推測補完せず、Recovered SWFの挙動として保存しています。

## ファイル
- `DATA_GUIDE.md` : 実装時にどのデータを使うかの案内
- `map/map_points_all.*` : 全289座標
- `map/named_stages_full.json` : 31有名ステージ、30slot配置＋有名兵
- `map/named_stage_technique_expectations.*` : 固定有名技種＋雑兵抽選の期待人数
- `formations/formations_all.json` : 71 formation IDs
- `formations/formation_units.csv` : 全slot座標・兵種・作戦
- `famous/famous_units_with_stage.csv` : 有名兵一覧
- `generation/generic_name_generation.json` : 雑兵名生成
- `generation/final_stat_envelopes_by_level.*` : Lv1～10の一般兵最終能力min/max envelope
- `generation/technique_probabilities_normal_battle.*` : 通常 `fmdat != n` 時の最終技種確率
- `generation/battle_setup_overrides.json` : 平地高Lv騎馬差し替え
- `raw/fmdt_strings.json`, `raw/chpr_decompiled_relevant.txt` : 検証用根拠
- `validation/remaining_uncertainties.md` : 未解決/範囲外事項
- `validation/provenance.json` : 元SWF識別情報

## 件数
- formation IDs: 71
- named stages: 31
- famous direct records: 127
- map cells: 289
