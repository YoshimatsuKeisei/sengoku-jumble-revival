# Codexへの指示文：本家SWF準拠の戦闘UI補正

既存の戦闘UI実装を、同梱の`battle_ui_timeline_manifest.json`、`root_frame14_layout.csv`、`timelines/*.csv`に基づいて補正してください。戦闘ロジック、AI、ダメージ、HP、勝敗判定は変更せず、表示層と表示専用状態だけを変更してください。

必須要件：

1. 座標系は本家380×380ステージを基準にし、カメラzoomとは独立したscreen-space UIとして描画する。
2. `ma`/`ea`を生存兵数へ常時連動する戦力ゲージとして使わない。これらは左右別の動的イベント通知欄であり、`cma(message)`/`cea(message)`相当のイベント時だけframe2から再生する。
   - 24fps
   - visible 44frame = 1.833秒
   - frame3–6の座標/color transformをCSVどおり再現
   - frame6–45保持後、非表示にして停止
   - Text変数`cm`へ11px白文字でmessageを表示
   - 同じmessageが現在の`cm`と同一なら再始動しない。異なるmessageなら再生途中でもframe2から再始動
   - PLAYER/左`cma`: 戦線離脱、PLAYER側堅陣、自陣攻略/攻撃警告、療所、一時退避
   - ENEMY/右`cea`: ENEMY側堅陣、敵陣攻略/攻撃、討ち取り
3. 操作説明を「開始後6秒固定」で表示しない。`uwd`初回シーケンスを再現する。
   - 下部panel: stage y=380→340で進入、保持、y=380へ退場
   - frame2–108、107frame=4.458秒
   - PLAYER/技能クリック案内は2498の5frame遅延＋fadeを使い、特殊技READYへ無条件に連動させない
4. `uwd`を単一message controllerとして実装する。
   - temporary warning state2/3/4: `stta`相当を一度再生
   - base fallen state6/7: `sttb`相当の完成位置へ即表示して結果遷移まで保持
   - `uwd`は固定Bitmap警告用。動的な討ち取り等は`ma`/`ea`へ流し、独自の複数toast積み上げをしない
5. 終了ボタンはstage(343,343)、YESは(201,350)、NOは(269,350)。YES左・NO右。
   - NOはpanelを退場して通常状態へ戻す
   - YESは既存の安全な終了/画面遷移処理へ接続する
   - 新しい勝敗条件やダメージ処理は作らない
6. 下部status panelはstage(-2,340)。右欄は既存の攻撃/接触target更新へ接続する。pointer任意選択を残すなら「本家外の補助機能」として分離し、本家targetを上書きしない。
7. `trm`はtarget allegianceでframe1=自/味方、frame2=敵を即時切替する。
8. `kpb`は100frameの値選択として扱う。無根拠な45frame CSS補間は適用しない。
9. `kalt`は本家timelineを尊重し、ルール注意のfade/hold/fade、モード分岐、勝ち抜き/成長counterのstop状態を実装可能な表示モデルへ分離する。ゲーム側に対応状態がなければ未接続のままにする。
10. `htbr`、message state8、左status更新は同梱manifestで未確定。用途を断定した実装をしない。
11. Atlas読込失敗時のみ既存fallbackを使い、正常時は旧CSS装飾を二重表示しない。
12. 戦闘開始/結果演出Sprite2531は同梱CSVに全frameを記録しているが、Bitmap2463がAtlasに無い。素材不足のまま類似背景を捏造せず、今回は未接続として明示してよい。

実装上は、24fpsの整数frameを持つ小さな`BattleUiTimelinePlayer`を作り、`elapsedMs * 24 / 1000`からframeを決めてください。CSS transition任せではなく、CSVのframe状態を参照できる設計にしてください。ゲームsimulation時間を遅らせず、表示専用clockで進めてください。

完了報告には、変更ファイル、本家準拠へ直した項目、未接続項目、実行した関連軽量テストだけを記載してください。全テスト/full buildは今回不要です。
