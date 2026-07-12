# ComChat リファクタリング指示書（下位モデル実行用）

**作成**: 2026-07-12 セッション49（設計: Claude Fable 5 / 実行想定: Claude Sonnet クラス）
**対象**: js/app.js（約4,150行・単一クラスComChat・142メソッド）を機能別の複数ファイルへ分割する

---

## 0. まず読むこと（実行モデルへの前提共有）

- ComChatはPeerJSベースのP2Pビデオ会議アプリ。**ビルド工程なし**・GitHub Pagesに静的配信。
- 品質保証は自動テストではなく**ユーザーのiPhone/Mac/Windows実機確認**。だからこの指示書の最重要原則は：

> **挙動を1ミリも変えないこと。メソッドはコメントも含め一字一句そのまま移動する。リネーム・整形・「ついで修正」は全面禁止。**

- 進捗・運用ルールの正はプロジェクト直下の `SESSION_SUMMARY.md` 冒頭。作業前に必ず読むこと。
- 運用ルール（既存踏襲）:
  - 新サイクル開始時に `APP_VERSION`（app.js内）の数字を上げてβを付ける（例 v4.14β）。βはユーザーが正式版を宣言するまで外さない。
  - コミット→push（GitHub Pagesが自動デプロイ）→ユーザーの実機確認OK後に `vX.Y-stable` タグを付与しpush。
  - 各セッション終了時に SESSION_SUMMARY.md 冒頭へ追記（旧エントリは「（旧）最終更新」へ降格）。

## 1. なぜこの方式か（設計判断・変更禁止）

**採用: prototype分割（mixin方式）＋複数`<script>`タグ**

```js
// 新ファイルの形（例: js/bgfilter.js）
// ComChat 背景フィルター機能（app.jsから分割）
Object.assign(ComChat.prototype, {
    getCSSFilter(type) {
        /* app.jsから一字一句そのまま */
    },   // ← メソッド間にカンマが必要（クラス本体では不要だった。唯一の書き換え点）

    initBgImagePanel() {
        /* ... */
    },
});
```

**不採用: ES modules（import/export）**
- 理由: 状態が全て`this`に載っており、モジュール化はimport/exportの大量書き換え＝挙動変更リスクが高い。旧Safari（2011年MBA等、コード内にwebkit接頭辞対応あり）の互換懸念もある。**ES modules化への変更提案は禁止。**

この方式なら、変更点は「メソッド間のカンマ」と「index.htmlのscriptタグ追加」だけ。`this`の意味・実行順・グローバル環境は完全に不変。

## 2. 最終形

```
index.html のscript読み込み順（この順序を厳守）:
  1. peerjs (CDN・既存のまま)
  2. js/app.js?v=N          ← class ComChat { constructor() {...} } だけが残る
  3. js/ui-init.js?v=N      ← Phase 3
  4. js/connection.js?v=N   ← Phase 4
  5. js/call-ui.js?v=N      ← Phase 5
  6. js/chat-memo-file.js?v=N ← Phase 6
  7. js/share-record.js?v=N ← Phase 7
  8. js/bgfilter.js?v=N     ← Phase 2（最初に切り出す）
  9. js/precall-lifecycle.js?v=N ← Phase 8
  10. js/main.js?v=N        ← Phase 1（bootstrap）
  11. 既存のインラインscript（触らない）
```

- mixinファイル間の順序は実行時には影響しない（定義のみ）が、上記順で固定する。
- `js/main.js` だけは実行コードなので**必ず最後**。
- 各ファイルに `?v=1` から始まる独立のキャッシュバスターを付け、そのファイルを変更した時だけ上げる。

## 3. フェーズ計画（1フェーズ＝1セッション厳守）

各フェーズは独立して安全。**1セッションで複数フェーズをやらない**（実機確認の切り分け単位を守るため）。

| Phase | 内容 | 移動するメソッド（この名前リストが正。行番号は使わない） |
|---|---|---|
| 1 | 骨組み: `js/main.js`新設。app.js末尾の`document.addEventListener('DOMContentLoaded', ...)`ブロック全体をmain.jsへ移動。index.htmlにscriptタグ追加 | （メソッド移動なし） |
| 2 | `js/bgfilter.js`（最大・最自己完結なので最初） | getCSSFilter, initBgImagePanel, loadBgHistory, addToHistory, renderHistoryThumbnails, clearBgPanelActive, showBgImagePanel, _presetUrl, drawPresetThumbnail, generatePresetBitmap, resizeImageToDataURL, loadBgFromDataURL, loadMediaPipe, initSelfieSegmentation, onSegmentationResults, checkSegmentationHealth, handleBgFilterBreakage, startBgFilterLoop, startCSSFilterLoop, stopBgFilterLoop, cleanupBgFilterResources, applyBgFilter, syncFilterBtnState, canUseBgFilter |
| 3 | `js/ui-init.js` | initializeUI, clampPanelToViewport, applyStoredControlOrder, loadStoredControlOrder, reorderControls, setupReorderMode, enterReorderMode, exitReorderMode, onReorderPointerDown, onReorderPointerMove, _reorderDraggedItem, onReorderPointerUp, cancelReorderDrag, showJoinInput, updateJoinReadyState |
| 4 | `js/connection.js` | createRoom, joinRoom, initializePeer, setupPeerEvents, attemptReconnect, describeMediaError, getUserMedia, connectToHost, connectToPeer, getOutgoingStream, handleConnection, sendStatesTo, handleIncomingCall, handleCall, handleDataMessage, cleanupPeer, broadcast, _allowMessage |
| 5 | `js/call-ui.js` | updateRoomInfo, renderRoomIdDisplay, toggleRoomLock, startEditUsername, confirmEditUsername, exitUsernameEdit, addVideoElement, removeVideoElement, relayoutVideoGrid, toggleVideo, toggleAudio, setMuteIndicator, setHandIndicator, sendReaction, showReactionOverlay, toggleHand, updateHandToggleBtn, ensureSpeakingAudioContext, registerSpeakingResumeRetry, unregisterSpeakingResumeRetry, attachSpeakingAnalyser, detachSpeakingAnalyser, startSpeakingLoop, stopSpeakingLoop, isParticipantMuted, updateSpeakingStates, setSpeakingIndicator, teardownSpeakingDetection |
| 6 | `js/chat-memo-file.js` | sendMessage, displayChatMessage, updateUnreadBadge, clearUnreadBadge, isChatCurrentlyOpen, toggleChat, openChat, closeChat, switchChatTab, onMemoInput, _releaseMemoLock, _clearMemoLock, _flushMemoUpdate, _pushMemoSnapshot, _updateMemoUndoBtn, undoMemo, downloadMemo, _showMemoDotIfHidden, sendFile, waitForBuffers, createFileProgress, updateFileProgress, finalizeFileProgress, formatFileSize |
| 7 | `js/share-record.js` | shareScreen, enterRemotePresenterMode, exitRemotePresenterMode, stopScreenShare, toggleScreenShareFullscreen, exitScreenShareFullscreen, buildMixedAudioTrack, teardownMixedAudio, attachRecordingSource, detachRecordingSource, _formatRecTime, _buildBlinkDot, updateRecordingIndicator, startRecording, stopRecording, saveRecordingFile, stopRecordingCleanup |
| 8 | `js/precall-lifecycle.js` ＋ 仕上げ | showPrecallStatus, showPreCallDialog, cancelPreCall, confirmPreCall, precallToggleVideo, precallToggleAudio, hangup, showHangupModal, hideHangupModal, showWelcomeScreen, showCallScreen, showStatus, showRecordingJoinNotice, copyRoomId, generateRoomId |

Phase 8完了後、app.jsには `class ComChat { constructor() {...} }` だけが残る（constructorは移動しない）。

## 4. 各フェーズの作業手順（毎回このチェックリストどおりに）

1. **開始条件確認**: `git status`がクリーン、直前が実機確認済みのstableタグ状態であること。SESSION_SUMMARY.md冒頭を読む。
2. `APP_VERSION` の数字を上げる（そのフェーズの新サイクルとして。例: Phase 2ならv4.15β…ただし現在値+1が正）。
3. 新ファイルを作成し、冒頭に `// ComChat <機能名>（app.jsから分割・挙動変更なし）` と書き、`Object.assign(ComChat.prototype, {` で開く。
4. 対象メソッドを表のリスト順に**app.jsから完全削除→新ファイルへ完全同文で貼り付け**。各メソッドの直前にあるコメント行（そのメソッドの説明コメント）も一緒に移動する。メソッド末尾にカンマを付ける。
5. 最後のメソッドの後に `});` で閉じる。
6. index.htmlに `<script src="js/<新ファイル>?v=1"></script>` を規定の位置（§2の順序）へ追加。app.jsの `?v=` も上げる。
7. **検証（機械）**:
   ```bash
   node --check js/app.js && node --check js/<新ファイル>   # 全ファイル構文OK
   # メソッド総数の照合（クラス本体+mixin内の合計が142のまま。以下は目安のカウント方法）
   grep -cE "^    (async )?[a-zA-Z_$]+\(" js/app.js js/*.js
   # 二重定義がないこと（各メソッド名でヒットが1ファイルのみ）
   for m in <移動したメソッド名>; do grep -l "    $m(" js/*.js | wc -l; done
   ```
8. **検証（動作）**: `python3 -m http.server 8123 --directory .` でローカル起動し、ブラウザで
   - ウェルカム画面が表示される・コンソールエラーゼロ
   - 可能なら2タブでルーム作成→参加→映像相互表示→退室（`TypeError: ... is not a function` が出たら移動漏れ。どのメソッドか即特定できる）
9. コミット（`refactor: Phase N <ファイル名>分割（挙動変更なし）`）→ SESSION_SUMMARY.md更新→push。
10. **ユーザーへ実機確認を依頼**。確認項目はそのフェーズの機能領域＋基本通話（下記§5）。OK後に `vX.Y-stable` タグ付与・push。

## 5. フェーズ別の実機確認ポイント

- **全フェーズ共通**: iPhoneでルーム作成→Mac/Windowsで参加→映像・音声・退室
- Phase 2: 背景ぼかし・背景画像・プリセット・フィルター解除
- Phase 3: ボタン並べ替え（その他メニュー）・並び順の保存
- Phase 4: 参加/退室/再入室・満員拒否・ルームロック
- Phase 5: カメラ/マイクON-OFF・リアクション・挙手・発話の緑枠・名前変更
- Phase 6: チャット送受信・未読バッジ・メモ（同時編集ロック）・ファイル送信
- Phase 7: 画面共有（PCから）・共有交代・全画面・録音開始/停止/保存
- Phase 8: プレコール画面・退室ボタン・ホスト退室確認・ルームID コピー

## 6. 落とし穴（実行モデルは必ず読むこと）

1. **カンマ**: クラス本体ではメソッド間にカンマ不要だが、`Object.assign`のオブジェクトリテラル内では**必要**。構文エラーはnode --checkで即発覚する。
2. **メソッド単位で移動する**。行番号や `}` の数を頼りに機械的に切らない。文字列内に `});` を含むコードがある。
3. **constructorは絶対に動かさない**。全プロパティ初期化はapp.jsに残す。
4. getter/setter・#privateフィールドは存在しない（確認済み）。`async`メソッドは `async name() {...}` のままオブジェクトリテラルでも有効。
5. **アロー関数・イベントリスナー内の`this`はprototype移動で意味が変わらない**。書き換え禁止。
6. iPhone Safariのキャッシュは強力。**キャッシュバスター（?v=）の上げ忘れが「直ってない」誤報の最多原因**。
7. 途中でバグらしきものを見つけても**このセッションでは直さない**。SESSION_SUMMARY.mdに「発見メモ」として記録し、ユーザーに報告だけする（挙動変更なしの原則を守る）。
8. うまくいかない時のロールバック: `git reset --hard <直前のstableタグ>`（未pushの場合）。push済みなら `git revert`。

## 7. 実施判断について（2026-07-12時点の結論）

このリファクタリングは**現時点では必須ではない**（コードは健全・単一ファイルでも開発に支障なし・自動テストがないため構造変更の回帰リスクの方が大きい、が理由）。実施するのは以下のトリガーが発生した時：
- app.jsが大きすぎてツール/モデルが扱えなくなった
- 機能追加が既存コードと絡まって書けなくなった
- 構造起因の同種バグが再発した

トークン節約の観点では、実行モデルはSonnetクラスで十分（この指示書は逐語移動の機械的作業に落とし込んであるため）。1フェーズ＝1セッションを厳守すれば、Proプランの制限内で完走できる想定。
