本家SWF準拠で戦闘終了後の4画面を実装してください。

配置済み素材は、プロジェクト直下の `assets/post_battle_ui/` にあります。最初に必ず次を読んでください。

- `assets/post_battle_ui/config/atlas_manifest.json`
- `assets/post_battle_ui/config/post_battle_ui_manifest.json`
- 同梱した `post_battle_ui_reference/data_contract.json`
- 同梱した `post_battle_ui_reference/README.md`

実装対象の遷移は `BattleScene終了 → battle_result（戦況判定）→ merit_list（戦功一覧）→ enemy_list（敵兵一覧）→ enemy_detail（敵兵詳細）` です。敵兵一覧の行を押すとその兵士の詳細へ進み、詳細の「前／次」で表示対象を切り替え、「敵兵一覧へ」で一覧へ戻してください。現在の要求では4画面を到達可能にしてください。ただし本家SWFでは敗北側ボタンがマップへ戻る差異があるため、敗北経路の扱いはレンダラーへ埋め込まず、1か所のroute policyとして分離してください。

戦闘ロジック、ダメージ、HP、AI、勝敗判定は変更しないでください。BattleScene終了時、破棄前の `BattleResult`、自敵の生存数、陣地HP、PLAYER/ENEMY Soldierの表示に必要な値、選択区画IDを読み取り専用の `PostBattleSnapshot` にコピーし、そのスナップショットだけを後続画面へ渡してください。後続画面から破棄済みSoldierを参照しないでください。

本家の得点入力 `mcp/ecp/mmb/emb/eth/mth` と現在ゲームの値の意味対応は未確定です。本家式がmanifestに記録されていても、勝手に既存のHP・人数へ割り当てないでください。獲得銭、戦功集計、登用資格、俸給、総禄高、軍団データ更新も新設しないでください。現在ゲームに既に存在している値だけ接続し、存在しない数値は `null` のまま `--` と表示してください。仮の0を入れないでください。

戦功一覧は自軍Soldierの名前を実データから表示し、戦功カウンタは既存フィールドが存在する場合だけ接続してください。敵兵一覧はBattleScene終了時に保存した敵SoldierスナップショットをUI確認用の行として表示して構いませんが、それを「登用可能」とは判定しないでください。詳細画面も同じスナップショットを表示し、「この兵を登用する」「登用しない」は本家の永続化条件が実装されるまで軍団・所持銭・俸給を変更しない無効操作にしてください。必要ならクリック時に表示専用の「未接続」通知だけ出してください。

描画はatlasを一度だけロードしてキャッシュし、`atlas_manifest.json` の矩形を元サイズのまま切り出してください。画像の再生成・補間・色変更は禁止です。論理座標は380×380固定とし、カメラやCSSサイズに対して一括スケールしてください。各要素へ個別の経験則オフセットを足さず、`post_battle_ui_manifest.json` の座標を基準にしてください。動的Textだけ既存フォント方式またはCanvas Textで重ね、静的見出し・パネル・ボタンラベルはatlas素材を使ってください。既存キャラSpriteは敵詳細のportrait anchor `(75,103)` に再利用してください。

戦況判定は24fps相当でmanifestのframe 1/17/29/42/55/67を再現し、0→1の16段階フェード、各行の順次表示、frame 67の勝敗印・下部・次へ表示後は入力待ちで保持してください。画面遷移を時間だけで自動実行しないでください。

一覧画面は本家どおりroot Y=30、行間27.3px、30行スロット、約10行表示で実装してください。wheel、スクロールバーthumbドラッグ、上端／下端制約を持たせ、表示外はクリップしてください。列見出しのhover/click領域とsort indexはmanifest準拠にし、並び替えは表示配列のコピーへだけ適用して元データ順を破壊しないでください。敵兵行全体をクリック領域にし、選択インデックスを保持してenemy_detailへ遷移してください。

敵詳細の前／次の端動作はSWF抽出だけでは循環か停止か確定できていません。推測で循環させず、端ではボタンを表示したままno-opにしてください。ボタンはup/over/downの各素材とSWFの実座標・実ヒットサイズを使用し、キーボード操作を加える場合も見た目や遷移を変えないでください。

実装は表示専用の `PostBattleScene` または同等のstate machineへ集約し、`battle_result | merit_list | enemy_list | enemy_detail` を明示的な状態として管理してください。BattleSceneへは終了時スナップショット生成と遷移呼び出し以外を持ち込まないでください。既存のマップ→Intro→BattleScene導線を壊さないでください。

不足データに仮データを使う場合はproduction modelへ混ぜず、`createPostBattlePreviewData()` 等の開発用adapterへ隔離し、実データの有無を判定して明示的に切り替えてください。軍団データ、所持銭、俸給、進行状況への書き込みは禁止です。

確認は変更箇所に関係する軽量テストと `tsc --noEmit` だけ実行してください。full test、full build、Playwright、ブラウザ自動操作、スクリーンショット自動比較は行わないでください。手動表示確認は私が行います。

完了報告では、変更ファイル、4画面の状態遷移、接続した実データ、`null/--`の仮表示、無効化した登用処理、SWF準拠の座標・タイミング、実行した軽量テストを簡潔に列挙してください。


追加で、`post_battle_ui_reference/enemy_detail_supplement/README.md` と `assets/post_battle_ui/config/enemy_detail_mapping.json` も読んでください。enemy_detail については、特殊能力を18枠として扱い、`nm/lhp/lkp/lsp/lpw/ldf/rkd` を正式な差し込みキーとして採用してください。`heishu` と `wazashu` は静的画像ではなくframe切替MovieClipです。