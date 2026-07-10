// ComChat - Main Application Logic

class ComChat {
    constructor() {
        this.peer = null;
        this.localStream = null;
        this.connections = new Map();
        this.calls = new Map();
        this.usernames = new Map();
        this.roomId = null;
        this.isHost = false;
        this.roomLocked = false;
        this.roomIdRevealed = false;
        this.username = 'ユーザー';
        this.isAudioMuted = false;
        this.muteStates = new Map();
        this.cameraStates = new Map();
        this.receivingFiles = new Map();
        this._msgRate = new Map(); // 悪意あるピアからのメッセージ洪水対策(ピアごとのレート計測)
        this.isConnecting = false;
        this.bgFilterType = 'none';
        this.bgFilterCanvas = null;
        this.bgFilterCtx = null;
        this.bgFilterStream = null;
        this.bgFilterAnimId = null;
        this._bgFilterLoopGen = 0; // 背景フィルターループの世代トークン(非停止・増殖バグ対策)
        this.bgSourceVideo = null;
        this.imageSegmenter = null;
        this.maskCanvas = null;
        this.maskCtx = null;
        this.maskImageData = null;
        this.blurCanvas = null;
        this.blurCtx = null;
        this.personCanvas = null;
        this.personCtx = null;
        this.smallCanvas = null;
        this.smallCtx = null;
        this.maskSmallCanvas = null;
        this.maskSmallCtx = null;
        this.sigmoidLUT = null;
        this.prevConfidenceData = null;
        this.bgSourceIsOwned = false;
        this.imageCapture = null;
        // 実行時のフィルター破綻検知(Air2のような端末で人物が消える/全体ボケ/クラッシュ対策)
        this._segFilterStartT = null;   // フィルター起動時刻(ウォームアップ計測用)
        this._segDegenStart = null;     // 破綻状態が連続し始めた時刻
        this._segHealthySeen = false;   // 起動後に一度でも人物が正常分離できたか
        this._bgFilterAutoDisableCount = 0;  // セッション内の自動オフ回数
        this._bgFilterRuntimeBlocked = false; // 2回検知後はそのセッション無効で確定
        this.bgImage = null;
        this.bgPresets = {};
        this.bgHistory = [];
        this.bgImagePanel = null;
        this.objectURLs = [];
        this.currentRemoteSharerId = null;
        this.currentScreenStream = null;
        this.cameraVideoTrack = null;
        this.mixAudioContext = null;
        this.mixedAudioTrack = null;
        this.mixSources = [];
        this.isLeaving = false;
        this.isReconnecting = false;
        // 発話インジケーター(active speaker detection)
        this.speakingAudioContext = null;   // 解析専用のAudioContext(通話開始時に生成)
        this.speakingAnalysers = new Map();  // id('local'|peerId) -> { analyser, source, data, speaking, quietSince }
        this.speakingLoopTimer = null;       // 全員を1本のループで計測するタイマー
        this._speakingResumeHandler = null;
        this._speakingResumeEvent = null;
        this.unreadCount = 0;
        this.isChatVisible = true;
        this.chatObserver = null;
        // 共有メモ(チャットパネル内のタブ)。全文をrev付きで送る後勝ち同期
        // (同revはpeerId辞書順タイブレーク)で全員の内容を揃える
        this.memoText = '';
        this.memoRev = 0;
        this.memoDirty = false;          // 自分の未送信編集があるか(デバウンス待ち)
        this.memoSnapshots = [];         // 「戻す」用の直前テキスト履歴(最大10件)
        this.activeChatTab = 'chat';     // 'chat' | 'memo'
        this._memoDebounceTimer = null;  // 入力デバウンス(800ms)で全文送信の頻度を抑える
        this._memoEditingTimer = null;   // 「◯◯さんが編集中…」表示の消去タイマー
        this._memoEditingSignalAt = 0;   // 自分のmemo-editing送信スロットル(2秒)
        // リアクション/挙手
        this.handStates = new Map();
        this.isHandRaised = false;
        this._lastReactionSentAt = 0;
        this.REACTION_EMOJIS = ['👍', '👏', '😂', '🎉', '❤️', '😮'];

        // 録音機能(全員のマイク音声をミックスしてローカル保存。用途別にAudioContextを
        // 分離する作法(ensureSpeakingAudioContext参照)に合わせ、録音専用のインスタンスを使う)
        this.isRecording = false;
        this.mediaRecorder = null;
        this.recordingChunks = [];
        this.recAudioContext = null;
        this.recDest = null;
        this.recSources = new Map(); // key: peerId または '__self__'
        this.recordingStates = new Map(); // リモートの録音中ピアId -> true(インジケーター表示用)
        this.recStartTime = 0;
        this.recTimerInterval = null;

        // コントロールバーの並べ替え(左利き対応・編集モード)
        this.CONTROL_ORDER_STORAGE_KEY = 'comchat-control-order';
        this.DEFAULT_CONTROL_ORDER = ['toggle-video', 'toggle-audio', 'share-screen', 'reaction-btn', 'toggle-chat', 'hangup', 'more-btn'];
        this.isReorderMode = false;
        this._reorderDrag = null; // ドラッグ中の状態(item, pointerId, 各種寸法)を保持

        this.initializeUI();
    }

    initializeUI() {
        this.welcomeScreen = document.getElementById('welcome-screen');
        this.callScreen = document.getElementById('call-screen');
        this.reactionOverlay = document.getElementById('reaction-overlay');
        this.videoGrid = document.getElementById('video-grid');
        this.chatMessages = document.getElementById('chat-messages');
        this.chatInput = document.getElementById('chat-input');
        this.chatUnreadBadge = document.getElementById('chat-unread-badge');
        this.chatToggleBadge = document.getElementById('chat-toggle-badge');
        this.chatContainer = document.querySelector('.chat-container');
        this.toggleChatBtn = document.getElementById('toggle-chat');
        this.chatCloseBtn = document.getElementById('chat-close-btn');
        this.chatObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                this.isChatVisible = true;
                this.clearUnreadBadge();
            } else {
                this.isChatVisible = false;
            }
        }, { threshold: 1.0 });
        this.statusDiv = document.getElementById('status'); // may be null if removed from HTML
        this.roomIdDisplay = document.getElementById('room-id-display');
        // ルームIDは既定で伏字表示(画面共有/スクショでの流出防止)。タップで表示/非表示を切替
        this.roomIdDisplay.addEventListener('click', () => {
            this.roomIdRevealed = !this.roomIdRevealed;
            this.renderRoomIdDisplay();
        });
        this.participantCount = document.getElementById('participant-count');
        this.roomInfoDiv = document.getElementById('room-info');
        this.joinGroup = document.getElementById('join-group');
        this.joinRoomIdInput = document.getElementById('join-room-id');
        this.confirmJoinBtn = document.getElementById('confirm-join');

        this.callMain = document.querySelector('.call-main');
        this.screenShareContainer = document.getElementById('screen-share-container');
        this.screenShareVideo = document.getElementById('screen-share-video');
        this.createRoomBtn = document.getElementById('create-room');
        this.joinRoomBtn = document.getElementById('join-room');
        this.chatSendBtn = document.getElementById('chat-send');
        this.hangupBtn = document.getElementById('hangup');
        this.toggleVideoBtn = document.getElementById('toggle-video');
        this.toggleAudioBtn = document.getElementById('toggle-audio');
        this.shareScreenBtn = document.getElementById('share-screen');
        this.stopShareBtn = document.getElementById('stop-share-btn');
        // iPhone/iPad(iOS・iPadOS)はgetDisplayMedia非対応で画面共有を発信できないため、
        // ボタン自体を出さずコントロールバーの余白に充てる(視聴専用のscreen-share-containerは別要素で無影響)
        this.supportsScreenShare = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
        if (!this.supportsScreenShare) {
            this.shareScreenBtn.closest('.ctrl-item').classList.add('hidden');
        }
        this.shareViewerLabel = document.getElementById('share-viewer-label');
        this.screenFullscreenBtn = document.getElementById('screen-fullscreen-btn');
        this.screenSharePlaceholder = document.getElementById('screen-share-placeholder');

        this.copyRoomIdBtn = document.getElementById('copy-room-id');
        this.copyRoomIdBtn.addEventListener('click', () => this.copyRoomId());

        this.usernameCurrentDisplay = document.getElementById('username-current');
        this.editUsernameBtn = document.getElementById('edit-username-btn');
        this.usernameEditInput = document.getElementById('username-edit-input');
        this.usernameConfirmBtn = document.getElementById('username-confirm-btn');
        this.editUsernameBtn.addEventListener('click', () => this.startEditUsername());
        this.usernameConfirmBtn.addEventListener('click', () => this.confirmEditUsername());
        this.usernameEditInput.addEventListener('keydown', (e) => {
            // IME変換確定のEnterで確定させない（チャット欄と同様の対策）
            if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) this.confirmEditUsername();
            else if (e.key === 'Escape') this.exitUsernameEdit();
        });

        this.createRoomBtn.addEventListener('click', () => this.showPreCallDialog('create'));
        this.joinRoomBtn.addEventListener('click', () => this.showJoinInput());
        // join-group is a <form>: both the submit button tap and the keyboard's
        // Enter/Go key fire 'submit'. This is the iOS-friendly path so the
        // confirm button doesn't need to be visible behind the keyboard.
        this.joinGroup.addEventListener('submit', (e) => {
            e.preventDefault();
            const roomId = this.joinRoomIdInput.value.trim();
            if (!roomId) { this.showStatus('ルームIDを入力してください', 'error'); return; }
            // joinRoomと同じサニタイズで事前検証する。全角数字等でIDが空になる入力を
            // ここで弾かないと、プリコール(カメラ取得・ボタン無効化)まで進んだ後に
            // joinRoomが早期returnし、カメラ掴みっぱなし＋ボタン無効のまま詰む。
            if (!roomId.toLowerCase().replace(/[^0-9a-z]/g, '')) {
                this.showStatus('ルームIDは半角英数字で入力してください', 'error');
                return;
            }
            this.showPreCallDialog('join');
        });
        // ルームID入力中は「参加する」を呼吸アニメで強調し「ルーム参加」をグレー化。
        // IDを入れた後に誤って「ルーム参加」を再度押して無反応と感じる誤操作を防ぐ。
        this.joinRoomIdInput.addEventListener('input', () => this.updateJoinReadyState());
        // Keep the confirm button reachable above the on-screen keyboard.
        this.joinRoomIdInput.addEventListener('focus', () => {
            setTimeout(() => {
                this.confirmJoinBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }, 300);
        });
        this.chatSendBtn.addEventListener('click', () => this.sendMessage());
        this.chatInput.addEventListener('keydown', (e) => {
            // IME変換確定のEnter(isComposing / 旧Safariの keyCode 229)は送信しない。
            // これを送信すると古い端末でテキストが残り、再Enterで重複送信になる。
            if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) this.sendMessage();
        });
        this.hangupModal = document.getElementById('hangup-modal');
        this.hangupConfirmBtn = document.getElementById('hangup-confirm');
        this.hangupCancelBtn = document.getElementById('hangup-cancel');

        this.hangupBtn.addEventListener('click', () => this.showHangupModal());
        this.hangupConfirmBtn.addEventListener('click', () => { this.hideHangupModal(); this.hangup(); });
        this.hangupCancelBtn.addEventListener('click', () => this.hideHangupModal());
        this.hangupModal.addEventListener('click', (e) => { if (e.target === this.hangupModal) this.hideHangupModal(); });
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            this.hideHangupModal();
            if (this.precallDialog && !this.precallDialog.classList.contains('hidden')) this.cancelPreCall();
        });
        this.toggleVideoBtn.addEventListener('click', () => this.toggleVideo());
        this.toggleAudioBtn.addEventListener('click', () => this.toggleAudio());
        this.shareScreenBtn.addEventListener('click', () => this.shareScreen());
        this.stopShareBtn.addEventListener('click', () => this.stopScreenShare());
        this.screenFullscreenBtn.addEventListener('click', () => this.toggleScreenShareFullscreen());
        // 全画面の開始/終了でボタンのアイコンとラベルを同期(Escキーや標準UIでの終了も拾う)
        const onFsChange = () => {
            const active = (document.fullscreenElement || document.webkitFullscreenElement) === this.screenShareContainer;
            this.screenShareContainer.classList.toggle('is-fullscreen', active);
            const label = active ? '全画面を終了' : '全画面表示';
            this.screenFullscreenBtn.title = label;
            this.screenFullscreenBtn.setAttribute('aria-label', label);
        };
        document.addEventListener('fullscreenchange', onFsChange);
        document.addEventListener('webkitfullscreenchange', onFsChange);
        if (this.toggleChatBtn) this.toggleChatBtn.addEventListener('click', () => this.toggleChat());
        if (this.chatCloseBtn) this.chatCloseBtn.addEventListener('click', () => this.closeChat());

        // 共有メモ(チャットパネル内のタブ)
        this.chatTabBtn = document.getElementById('chat-tab-btn');
        this.memoTabBtn = document.getElementById('memo-tab-btn');
        this.memoDot = document.getElementById('memo-dot');
        this.memoView = document.getElementById('memo-view');
        this.memoTextarea = document.getElementById('memo-textarea');
        this.memoUndoBtn = document.getElementById('memo-undo-btn');
        this.memoDownloadBtn = document.getElementById('memo-download-btn');
        this.memoEditingIndicator = document.getElementById('memo-editing-indicator');
        this.chatInputContainer = document.querySelector('.chat-input-container');
        this.chatTabBtn.addEventListener('click', () => this.switchChatTab('chat'));
        this.memoTabBtn.addEventListener('click', () => this.switchChatTab('memo'));
        this.memoTextarea.addEventListener('input', () => this.onMemoInput());
        this.memoUndoBtn.addEventListener('click', () => this.undoMemo());
        this.memoDownloadBtn.addEventListener('click', () => this.downloadMemo());

        this.fileInput = document.getElementById('file-input');
        this.fileAttachBtn = document.getElementById('file-attach-btn');
        this.isSendingFile = false;

        this.bgFilterBtn = document.getElementById('bg-filter');
        this.filterPanel = document.getElementById('filter-panel');
        this.moreBtn = document.getElementById('more-btn');
        this.moreMenu = document.getElementById('more-menu');
        // 背景フィルターパネルの位置は#more-btn(常時表示・安定した要素)基準で算出する。
        // #bg-filterは「その他」メニューの中の行なので、メニューを閉じた後は非表示/移動しうるため
        // 位置基準には使えない(タップ→メニューが閉じる→フィルターパネルが開く、という流れ)。
        this.bgFilterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.moreMenu.classList.add('hidden');
            if (this.bgImagePanel) this.bgImagePanel.classList.add('hidden');
            const isHidden = this.filterPanel.classList.contains('hidden');
            if (!isHidden) { this.filterPanel.classList.add('hidden'); return; }
            const rect = this.moreBtn.getBoundingClientRect();
            this.filterPanel.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
            this.filterPanel.style.left = (rect.left + rect.width / 2) + 'px';
            this.filterPanel.classList.remove('hidden');
            this.clampPanelToViewport(this.filterPanel, rect);
        });
        document.addEventListener('click', () => {
            this.filterPanel.classList.add('hidden');
            if (this.bgImagePanel) this.bgImagePanel.classList.add('hidden');
            if (this.reactionPanel) this.reactionPanel.classList.add('hidden');
            if (this.moreMenu) this.moreMenu.classList.add('hidden');
        });
        this.filterPanel.addEventListener('click', (e) => {
            e.stopPropagation();
            const option = e.target.closest('.filter-option');
            if (!option) return;
            this.filterPanel.classList.add('hidden');
            const filter = option.dataset.filter;
            // 非対応端末ではフィルターを起動せずメッセージ表示(blur/image両方の入口でガード)
            if (filter !== 'none' && this.bgFilterType === 'none' && !this.canUseBgFilter()) {
                const inPrecall = this.precallDialog && !this.precallDialog.classList.contains('hidden');
                if (inPrecall) {
                    this.showPrecallStatus('この端末では背景フィルターを使えません');
                } else {
                    this.showStatus('この端末では背景フィルターを使えません', 'error');
                }
                return;
            }
            if (filter === 'image') {
                this.showBgImagePanel();
            } else {
                this.applyBgFilter(filter);
            }
        });
        this.initBgImagePanel();

        // 「その他」メニュー: フィルター等、頻度の低い機能をまとめる汎用リスト
        this.moreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.filterPanel.classList.add('hidden');
            if (this.bgImagePanel) this.bgImagePanel.classList.add('hidden');
            if (this.reactionPanel) this.reactionPanel.classList.add('hidden');
            const isHidden = this.moreMenu.classList.contains('hidden');
            if (!isHidden) { this.moreMenu.classList.add('hidden'); return; }
            const rect = this.moreBtn.getBoundingClientRect();
            this.moreMenu.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
            this.moreMenu.style.left = (rect.left + rect.width / 2) + 'px';
            this.moreMenu.classList.remove('hidden');
            this.clampPanelToViewport(this.moreMenu, rect);
        });
        this.moreMenu.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // ボタンの並べ替え(編集モード)
        this.controlsEl = document.querySelector('.controls');
        this.reorderBtn = document.getElementById('reorder-btn');
        this.reorderToolbar = document.getElementById('reorder-toolbar');
        this.reorderDoneBtn = document.getElementById('reorder-done-btn');
        this.reorderResetBtn = document.getElementById('reorder-reset-btn');
        this.applyStoredControlOrder();
        this.setupReorderMode();

        // ルームロック(ホスト限定)
        this.roomLockBtn = document.getElementById('room-lock-btn');
        this.roomLockLabel = document.getElementById('room-lock-label');
        this.roomLockBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.moreMenu.classList.add('hidden');
            this.toggleRoomLock();
        });

        // 録音
        this.recordBtn = document.getElementById('record-btn');
        this.recordLabel = document.getElementById('record-label');
        this.recordingIndicator = document.getElementById('recording-indicator');
        this.recordBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.moreMenu.classList.add('hidden');
            if (this.isRecording) this.stopRecording();
            else this.startRecording();
        });

        this.reactionBtn = document.getElementById('reaction-btn');
        this.reactionPanel = document.getElementById('reaction-panel');
        this.handToggleBtn = document.getElementById('hand-toggle-btn');
        this.reactionBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.filterPanel.classList.add('hidden');
            if (this.bgImagePanel) this.bgImagePanel.classList.add('hidden');
            if (this.moreMenu) this.moreMenu.classList.add('hidden');
            const isHidden = this.reactionPanel.classList.contains('hidden');
            if (!isHidden) { this.reactionPanel.classList.add('hidden'); return; }
            const rect = this.reactionBtn.getBoundingClientRect();
            this.reactionPanel.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
            this.reactionPanel.style.left = (rect.left + rect.width / 2) + 'px';
            this.reactionPanel.classList.remove('hidden');
            // 小画面(iPhone等)でボタンが画面端に近いと中央揃えのパネルがはみ出すため、
            // 表示後に実寸を測って画面内(左右8pxマージン)へ寄せる
            this.clampPanelToViewport(this.reactionPanel, rect);
        });
        this.reactionPanel.addEventListener('click', (e) => {
            e.stopPropagation();
            const emojiBtn = e.target.closest('.reaction-emoji-btn');
            if (emojiBtn) {
                this.sendReaction(emojiBtn.dataset.emoji);
                return;
            }
            if (e.target.closest('#hand-toggle-btn')) {
                this.toggleHand();
            }
        });

        this.fileAttachBtn.addEventListener('click', () => {
            if (!this.isSendingFile) this.fileInput.click();
        });
        this.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) { this.sendFile(file); e.target.value = ''; }
        });

        // Pre-call settings dialog
        this.precallDialog = document.getElementById('precall-dialog');
        this.precallPreview = document.getElementById('precall-preview');
        this.precallNoCamera = document.getElementById('precall-no-camera');
        this.precallVideoBtn = document.getElementById('precall-video-btn');
        this.precallAudioBtn = document.getElementById('precall-audio-btn');
        this.precallFilterBtn = document.getElementById('precall-filter-btn');
        this.precallConfirmBtn = document.getElementById('precall-confirm');
        this.precallCancelBtn = document.getElementById('precall-cancel');

        this.precallVideoBtn.addEventListener('click', () => this.precallToggleVideo());
        this.precallAudioBtn.addEventListener('click', () => this.precallToggleAudio());
        this.precallFilterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!this.canUseBgFilter()) {
                this.showPrecallStatus('この端末では背景フィルターを使えません');
                return;
            }
            if (this.bgImagePanel) this.bgImagePanel.classList.add('hidden');
            const isHidden = this.filterPanel.classList.contains('hidden');
            if (!isHidden) { this.filterPanel.classList.add('hidden'); return; }
            const rect = this.precallFilterBtn.getBoundingClientRect();
            this.filterPanel.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
            this.filterPanel.style.left = (rect.left + rect.width / 2) + 'px';
            this.filterPanel.classList.remove('hidden');
        });
        this.precallConfirmBtn.addEventListener('click', () => this.confirmPreCall());
        this.precallCancelBtn.addEventListener('click', () => this.cancelPreCall());
        // バックドロップタップでキャンセル。ただし「押し始め(pointerdown)も背景」の場合に
        // 限定する。iOSはキーボード表示直後などにfixed要素のタップ判定がずれることがあり、
        // ボタンを押したつもりのタップがclickだけ背景判定になって誤キャンセルされるため。
        // (PointerEvent非対応の旧Safariでは _precallPressTarget が undefined のままなので
        //  従来どおり click のみで判定される)
        this.precallDialog.addEventListener('pointerdown', (e) => {
            this._precallPressTarget = e.target;
        });
        this.precallDialog.addEventListener('click', (e) => {
            if (e.target !== this.precallDialog) return;
            if (this._precallPressTarget !== undefined && this._precallPressTarget !== this.precallDialog) return;
            this.cancelPreCall();
        });

        // バックグラウンド中に取りこぼした状態メッセージ(ミュート等)を復帰時に再同期する。
        // broadcast()はconn.open前の接続をスキップするため、一発勝負の状態通知は
        // タイミング次第で永遠に欠落しうる(実機でiPadのミュートアイコン欠落として顕在化)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            if (!this.peer || this.isLeaving || this.connections.size === 0) return;
            const now = Date.now();
            if (this._lastSyncRequest && now - this._lastSyncRequest < 2000) return; // 連発抑止
            this._lastSyncRequest = now;
            this.broadcast({ type: 'state-sync-request' });
        });
    }

    // 小画面(iPhone等)でトリガーボタンが画面端に近いと中央揃えのパネル(left:transform(-50%))が
    // はみ出すため、表示後に実寸を測って画面内(左右8pxマージン)へ寄せる。
    // reaction-panelで実装していたクランプ処理をfilter-panel/more-menuでも使えるよう共通化した。
    clampPanelToViewport(panel, anchorRect) {
        const pr = panel.getBoundingClientRect();
        let shift = 0;
        if (pr.right > window.innerWidth - 8) shift = (window.innerWidth - 8) - pr.right;
        else if (pr.left < 8) shift = 8 - pr.left;
        if (shift) panel.style.left = (anchorRect.left + anchorRect.width / 2 + shift) + 'px';
    }

    // ==== コントロールバーの並べ替え(左利き対応・編集モード) ====

    // 起動時: 保存済みの並び順があればDOM並べ替えで適用する。
    // 堅牢なマージ: 保存配列から現存しないidを除去し、保存配列に無い現存ボタン
    // (将来追加される新機能ボタン)はデフォルトの並び関係を保ちつつ位置を補う。
    applyStoredControlOrder() {
        const order = this.loadStoredControlOrder();
        if (!order) return;
        this.reorderControls(order);
    }

    loadStoredControlOrder() {
        let saved;
        try {
            const raw = localStorage.getItem(this.CONTROL_ORDER_STORAGE_KEY);
            if (!raw) return null;
            saved = JSON.parse(raw);
        } catch (e) {
            return null;
        }
        if (!Array.isArray(saved)) return null;

        const existingIds = Array.from(this.controlsEl.querySelectorAll(':scope > .ctrl-item > .control-btn')).map(b => b.id);
        const existingSet = new Set(existingIds);
        // 保存配列から現存しないid(過去に削除された機能等)を除去
        const merged = saved.filter(id => existingSet.has(id));
        const mergedSet = new Set(merged);
        // 保存配列に無い現存ボタン(新機能等)をデフォルト順の相対位置を保って挿入
        this.DEFAULT_CONTROL_ORDER.forEach(id => {
            if (existingSet.has(id) && !mergedSet.has(id)) {
                merged.push(id);
                mergedSet.add(id);
            }
        });
        // デフォルトにも保存にも無い未知のid(念のため)は末尾に残す
        existingIds.forEach(id => {
            if (!mergedSet.has(id)) { merged.push(id); mergedSet.add(id); }
        });
        return merged;
    }

    // idの配列順に.ctrl-itemをDOM並べ替えする
    reorderControls(idOrder) {
        idOrder.forEach(id => {
            const btn = document.getElementById(id);
            const item = btn && btn.closest('.ctrl-item');
            if (item) this.controlsEl.appendChild(item);
        });
    }

    setupReorderMode() {
        if (this.reorderBtn) {
            this.reorderBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.moreMenu.classList.add('hidden');
                this.enterReorderMode();
            });
        }
        if (this.reorderDoneBtn) {
            this.reorderDoneBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.exitReorderMode(true);
            });
        }
        if (this.reorderResetBtn) {
            this.reorderResetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.reorderControls(this.DEFAULT_CONTROL_ORDER);
                localStorage.removeItem(this.CONTROL_ORDER_STORAGE_KEY);
                // 編集モードは継続(完了を押すまで並べ替えを続けられる)
            });
        }

        // 編集モード中はボタン本来の動作を完全に抑止する。
        // キャプチャ段階のclickリスナーなので、各ボタンのバブリング段階リスナーより
        // 先に発火しstopPropagation+preventDefaultできる(誤って退室モーダル等が開くのを防ぐ)。
        this.controlsEl.addEventListener('click', (e) => {
            if (!this.isReorderMode) return;
            e.stopPropagation();
            e.preventDefault();
        }, true);

        // ドラッグ&ドロップ(Pointer Eventsで自前実装。HTML5 D&DはiOSタッチで動かないため使用しない)
        this.controlsEl.addEventListener('pointerdown', (e) => this.onReorderPointerDown(e));
        this.controlsEl.addEventListener('pointermove', (e) => this.onReorderPointerMove(e));
        this.controlsEl.addEventListener('pointerup', (e) => this.onReorderPointerUp(e));
        this.controlsEl.addEventListener('pointercancel', (e) => this.onReorderPointerUp(e));
    }

    enterReorderMode() {
        if (this.isReorderMode) return;
        this.isReorderMode = true;
        // 編集モード中に開いているパネル類は全て閉じる
        this.filterPanel.classList.add('hidden');
        if (this.bgImagePanel) this.bgImagePanel.classList.add('hidden');
        if (this.reactionPanel) this.reactionPanel.classList.add('hidden');
        this.moreMenu.classList.add('hidden');
        this.controlsEl.classList.add('reorder-mode');
        this.reorderToolbar.classList.remove('hidden');
    }

    exitReorderMode(save) {
        if (!this.isReorderMode) return;
        this.isReorderMode = false;
        this.cancelReorderDrag();
        this.controlsEl.classList.remove('reorder-mode');
        this.reorderToolbar.classList.add('hidden');
        if (save) {
            const order = Array.from(this.controlsEl.querySelectorAll(':scope > .ctrl-item > .control-btn')).map(b => b.id);
            try {
                localStorage.setItem(this.CONTROL_ORDER_STORAGE_KEY, JSON.stringify(order));
            } catch (e) { /* ストレージ不可でも編集モードは正常終了させる */ }
        }
    }

    onReorderPointerDown(e) {
        if (!this.isReorderMode) return;
        // 同時ドラッグは1つまで
        if (this._reorderDrag) return;
        const item = e.target.closest('.ctrl-item');
        if (!item || item.parentElement !== this.controlsEl) return;
        e.preventDefault();
        // キャプチャはDOM移動しないコンテナ側に取る。ドラッグ中のitemはinsertBeforeで
        // 移動する(=一旦removeされてから挿入される)ため、item自身に取るとエンジンに
        // よってはその瞬間キャプチャが解除され、指がバー外に出るとpointermove/pointerupを
        // 取りこぼしてドラッグ状態が固着する(リスナーはcontrolsEl側なので受信にも支障なし)
        try {
            if (this.controlsEl.setPointerCapture) this.controlsEl.setPointerCapture(e.pointerId);
        } catch (err) { /* 非対応環境でもバー内の追跡は動く */ }
        item.classList.add('reorder-dragging');
        this._reorderDrag = {
            item,
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
        };
    }

    onReorderPointerMove(e) {
        const drag = this._reorderDrag;
        if (!drag || e.pointerId !== drag.pointerId) return;
        e.preventDefault();
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        drag.item.style.transform = `translate(${dx}px, ${dy}px) scale(1.12)`;

        // 水平位置が他itemの中点を越えたらDOMを並べ替える(正しさ優先の即時reorder。
        // FLIPアニメーションは行わず、insertBeforeによる即時reorderのみ)
        const siblings = Array.from(this.controlsEl.querySelectorAll(':scope > .ctrl-item')).filter(el => el !== drag.item);
        const pointerX = e.clientX;
        for (const sib of siblings) {
            const sr = sib.getBoundingClientRect();
            const midX = sr.left + sr.width / 2;
            const sibIsAfter = !!(drag.item.compareDocumentPosition(sib) & Node.DOCUMENT_POSITION_FOLLOWING);
            if (sibIsAfter && pointerX > midX) {
                // 対象は現在ドラッグitemより後方にあり、ポインタがその中点を越えた→対象の後ろへ移動
                this._reorderDraggedItem(drag, sib.nextSibling, e);
                break;
            } else if (!sibIsAfter && pointerX < midX) {
                // 対象は現在ドラッグitemより前方にあり、ポインタがその中点を越えた→対象の前へ移動
                this._reorderDraggedItem(drag, sib, e);
                break;
            }
        }
    }

    // ドラッグ中itemのDOM移動。insertBeforeで自分のレイアウト位置(スロット)が変わるため、
    // そのままだとtranslateの基準がずれてボタンが指から1スロット分飛ぶ。移動前後の
    // レイアウト差分でstartX/Yを補正し、見た目の位置を指の下に留める
    _reorderDraggedItem(drag, refNode, e) {
        const before = drag.item.getBoundingClientRect();
        this.controlsEl.insertBefore(drag.item, refNode);
        const after = drag.item.getBoundingClientRect();
        drag.startX += after.left - before.left;
        drag.startY += after.top - before.top;
        drag.item.style.transform = `translate(${e.clientX - drag.startX}px, ${e.clientY - drag.startY}px) scale(1.12)`;
    }

    onReorderPointerUp(e) {
        const drag = this._reorderDrag;
        if (!drag || e.pointerId !== drag.pointerId) return;
        this.cancelReorderDrag();
    }

    // ドラッグ状態の解消(pointerup/pointercancel/編集モード強制終了時に共通で呼ぶ)
    cancelReorderDrag() {
        const drag = this._reorderDrag;
        if (!drag) return;
        drag.item.classList.remove('reorder-dragging');
        drag.item.style.transform = '';
        try {
            if (this.controlsEl.releasePointerCapture) this.controlsEl.releasePointerCapture(drag.pointerId);
        } catch (e) {}
        this._reorderDrag = null;
    }

    showJoinInput() {
        this.joinGroup.classList.remove('hidden');
        this.joinRoomIdInput.focus();
        this.updateJoinReadyState();
    }

    updateJoinReadyState() {
        const ready = this.joinRoomIdInput.value.trim().length > 0;
        this.confirmJoinBtn.classList.toggle('btn-ready', ready);
        this.joinRoomBtn.classList.toggle('btn-dimmed', ready);
    }

    async createRoom() {
        if (this.isConnecting) return;
        this.isConnecting = true;
        this.createRoomBtn.disabled = true;
        this.joinRoomBtn.disabled = true;
        try {
            this.showStatus('ルームを作成中...', 'connecting');

            this.roomId = this.generateRoomId();
            this.isHost = true;

            await this.initializePeer(this.roomId);
            await this.getUserMedia();
            this.setupPeerEvents();

            this.showCallScreen();
            this.updateRoomInfo();
            this.showStatus('ルームを作成しました。ルームIDを友達に共有してください', 'connected');

        } catch (error) {
            this.stopBgFilterLoop();
            this.cleanupBgFilterResources();
            this.teardownSpeakingDetection();
            this.bgFilterType = 'none';
            if (this.localStream) {
                this.localStream.getTracks().forEach(t => t.stop());
                this.localStream = null;
            }
            if (this.peer) { this.peer.destroy(); this.peer = null; }
            // 失敗時の残骸がMapに残らないよう確実にクリア(joinRoomと同様の保険)
            this.connections.clear();
            this.calls.clear();
            this.usernames.clear();
            this.muteStates.clear();
            this.cameraStates.clear();
            this.handStates.clear();
            this.isHost = false;
            this.roomId = null;
            this.createRoomBtn.disabled = false;
            this.joinRoomBtn.disabled = false;
            this.confirmJoinBtn.disabled = false;
            this.showStatus('ルーム作成に失敗しました: ' + error.message, 'error');
        } finally {
            this.isConnecting = false;
        }
    }

    async joinRoom() {
        if (this.isConnecting) return;
        // Strip iOS smart punctuation / auto-capitalization; room IDs are lowercase [0-9a-z]
        const roomId = this.joinRoomIdInput.value.trim().toLowerCase().replace(/[^0-9a-z]/g, '');
        if (!roomId) {
            // 通常はform submit側の事前検証で弾かれるが、万一ここに来た場合は
            // プリコールで取得したカメラ/フィルターを解放しボタンを復元する(詰み防止の保険)。
            // この早期returnはtry/catchの前なのでcatchのクリーンアップが走らない。
            this.stopBgFilterLoop();
            this.cleanupBgFilterResources();
            this.bgFilterType = 'none';
            if (this.localStream) {
                this.localStream.getTracks().forEach(t => t.stop());
                this.localStream = null;
            }
            this.createRoomBtn.disabled = false;
            this.joinRoomBtn.disabled = false;
            this.confirmJoinBtn.disabled = false;
            this.showStatus('ルームIDは半角英数字で入力してください', 'error');
            return;
        }
        this.isConnecting = true;
        this.confirmJoinBtn.disabled = true;
        try {
            this.showStatus('ルームに参加中...', 'connecting');
            this.roomId = roomId;
            this.isHost = false;

            await this.initializePeer();
            await this.getUserMedia();
            this.setupPeerEvents();
            await this.connectToHost(roomId);

            this.showCallScreen();
            this.updateRoomInfo();

        } catch (error) {
            this.stopBgFilterLoop();
            this.cleanupBgFilterResources();
            this.teardownSpeakingDetection();
            this.bgFilterType = 'none';
            if (this.localStream) {
                this.localStream.getTracks().forEach(t => t.stop());
                this.localStream = null;
            }
            if (this.peer) { this.peer.destroy(); this.peer = null; }
            // peer破棄後もセッション用Mapに失敗時の残骸が残ると、同じIDで再参加した際に
            // connectToHost が「接続済み」と誤判定して通話画面に入ってしまう。確実にクリアする。
            this.connections.clear();
            this.calls.clear();
            this.usernames.clear();
            this.muteStates.clear();
            this.cameraStates.clear();
            this.handStates.clear();
            this.roomId = null;
            this.createRoomBtn.disabled = false;
            this.joinRoomBtn.disabled = false;
            this.confirmJoinBtn.disabled = false;
            this.showStatus('ルーム参加に失敗しました: ' + error.message, 'error');
        } finally {
            this.isConnecting = false;
        }
    }

    async initializePeer(id = null) {
        this.isLeaving = false;
        this.isReconnecting = false;
        return new Promise((resolve, reject) => {
            this.peer = new Peer(id, { debug: 0 });

            // PeerJS のクラウドサーバ接続が滞ると 'open'/'error' のどちらも
            // 来ずに永久にハングするため、タイムアウトで必ず解決させる
            let settled = false;
            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                this.peer.off('open', onOpen);
                this.peer.off('error', onError);
                reject(new Error('サーバーに接続できませんでした（タイムアウト）。電波状況をご確認ください'));
            }, 10000);

            const onOpen = (peerId) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                this.peer.off('error', onError);
                resolve(peerId);
            };

            const onError = (error) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                this.peer.off('open', onOpen);
                console.error('Peer error:', error);
                reject(error);
            };

            this.peer.on('open', onOpen);
            this.peer.on('error', onError);
        });
    }

    // Called only after getUserMedia completes to guarantee localStream is ready
    setupPeerEvents() {
        this.peer.on('connection', (conn) => {
            this.handleConnection(conn);
        });

        this.peer.on('call', (call) => {
            this.handleIncomingCall(call);
        });

        this.peer.on('error', (err) => {
            console.error('Peer error:', err);
            if (err.type === 'peer-unavailable') {
                this.showStatus('接続先が見つかりませんでした', 'error');
            } else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
                this.showStatus('接続が切断されました。再度お試しください', 'error');
            }
        });

        // Signaling server connection dropped. Existing P2P links may survive,
        // but new peers can't join until we reconnect with the same ID.
        this.peer.on('disconnected', () => {
            if (this.isLeaving || !this.peer || this.peer.destroyed) return;
            // Guard against parallel retry chains if 'disconnected' fires repeatedly
            if (this.isReconnecting) return;
            this.isReconnecting = true;
            this.showStatus('接続が不安定です。再接続中...', 'connecting');
            this.attemptReconnect(0);
        });
    }

    attemptReconnect(n) {
        if (this.isLeaving || !this.peer || this.peer.destroyed) { this.isReconnecting = false; return; }
        if (!this.peer.disconnected) {
            this.isReconnecting = false;
            this.showStatus('再接続しました', 'connected');
            return;
        }
        if (n >= 5) {
            this.isReconnecting = false;
            this.showStatus('サーバーに再接続できませんでした', 'error');
            return;
        }
        try { this.peer.reconnect(); } catch {}
        setTimeout(() => this.attemptReconnect(n + 1), 2000 * (n + 1));
    }

    // Map a getUserMedia failure to an actionable Japanese message. iOS Safari
    // (especially Private Browsing / non-HTTPS) surfaces several distinct causes.
    describeMediaError(err) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            return 'カメラ/マイクを利用できません。HTTPS接続でアクセスしてください';
        }
        switch (err && err.name) {
            case 'NotAllowedError':
            case 'SecurityError':
                return 'カメラ/マイクの使用が許可されていません。Safariの設定で許可してください';
            case 'NotFoundError':
            case 'OverconstrainedError':
                return 'カメラまたはマイクが見つかりません';
            case 'NotReadableError':
                return 'カメラ/マイクが他のアプリで使用中です。他のアプリを閉じてからお試しください';
            default:
                return 'カメラ/マイクにアクセスできませんでした（' + (err && err.name ? err.name : '不明なエラー') + '）';
        }
    }

    async getUserMedia() {
        if (!this.localStream) {
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: true
                });
            } catch (error) {
                throw new Error(this.describeMediaError(error));
            }
        }
        const displayStream = (this.bgFilterType !== 'none' && this.bgFilterStream)
            ? this.bgFilterStream : this.localStream;
        this.addVideoElement('local', displayStream, this.username);
        // 発話インジケーター: 自分のマイク「生トラック」を解析対象にする(displayStreamは
        // 画面共有中に映像だけのcanvasストリームになりうるため、必ずlocalStreamを使う)
        this.attachSpeakingAnalyser('local', this.localStream);
    }

    // ホストへの参加時は、データ接続が実際に開くまで待つ。開かなければ reject し、
    // joinRoom 側の catch がウェルカム画面へ戻してエラー表示する。
    // これがないと、ルームID誤入力やホスト退出済みでも通話画面に遷移し、
    // 誰もいない部屋に取り残される(撃ちっぱなしで接続成立を待っていなかった)。
    connectToHost(hostId) {
        return new Promise((resolve, reject) => {
            if (this.connections.has(hostId)) { resolve(); return; }
            const conn = this.peer.connect(hostId);
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                try { conn.close(); } catch {}
                reject(new Error('ルームが見つかりませんでした。ルームIDをご確認ください'));
            }, 10000);
            // handleConnection も別途 'open' を登録するが(user-join送信等)、複数リスナーは併存可
            conn.on('open', () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve();
            });
            this.handleConnection(conn);
            // 容量超過等で handleConnection が conn を登録しなかった場合は発信しない
            if (!this.connections.has(hostId)) {
                if (!settled) { settled = true; clearTimeout(timer); }
                resolve();
                return;
            }
            const call = this.peer.call(hostId, this.getOutgoingStream());
            this.handleCall(call);
        });
    }

    connectToPeer(peerId) {
        if (this.connections.has(peerId)) return;
        const conn = this.peer.connect(peerId);
        this.handleConnection(conn);
        // handleConnection が容量超過でconn.close()した場合はコールも発信しない
        if (!this.connections.has(peerId)) return;
        const call = this.peer.call(peerId, this.getOutgoingStream());
        this.handleCall(call);
    }

    // Build the outgoing media stream: correct video source (screen > bg-filter
    // canvas > camera) paired with the mic audio (or mixed mic+screen audio
    // while screen-sharing). The canvas captureStream has no audio track, so
    // explicitly attaching audio here keeps late joiners from losing our voice.
    getOutgoingStream() {
        const tracks = [];
        let videoTrack;
        if (this.currentScreenStream) {
            videoTrack = this.currentScreenStream.getVideoTracks()[0];
        } else if (this.bgFilterType !== 'none' && this.bgFilterStream) {
            videoTrack = this.bgFilterStream.getVideoTracks()[0];
        } else {
            videoTrack = this.localStream?.getVideoTracks()[0];
        }
        if (videoTrack) tracks.push(videoTrack);
        const audioTrack = this.mixedAudioTrack || this.localStream?.getAudioTracks()[0];
        if (audioTrack) tracks.push(audioTrack);
        return new MediaStream(tracks);
    }

    handleConnection(conn) {
        // 定員判定の前に、確実に死んでいる接続を掃除する(クラッシュ・タブ閉じ等で
        // 明示退室が届かず、ICE切断イベントも発火しない端末で残るゴースト対策)。
        // connectionStateが取れない環境や接続確立中('connecting')のピアには触れない
        this.connections.forEach((c, id) => {
            const st = c.peerConnection?.connectionState;
            if (st === 'failed' || st === 'closed') this.cleanupPeer(id);
        });
        // ルームロック中は新規参加をすべて拒否する(v1はシンプルに全拒否。既存メンバーの
        // 再接続もここで一緒に拒否されるが、ロック中はそもそも想定しない運用として許容)
        if (this.isHost && this.roomLocked) {
            conn.on('open', () => {
                try { conn.send({ type: 'room-locked' }); } catch {}
                setTimeout(() => { try { conn.close(); } catch {} }, 150);
            });
            return;
        }
        // Enforce 6-person limit (5 remotes + self)
        if (this.connections.size >= 5) {
            // Notify the joiner that the room is full before closing, so they
            // can show an error instead of silently landing in an empty room.
            conn.on('open', () => {
                try { conn.send({ type: 'room-full' }); } catch {}
                setTimeout(() => { try { conn.close(); } catch {} }, 150);
            });
            return;
        }
        // Reject duplicate connections from the same peer
        if (this.connections.has(conn.peer)) {
            conn.close();
            return;
        }

        this.connections.set(conn.peer, conn);

        conn.on('error', (err) => {
            console.error('Connection error:', err);
            // ホストとの接続が切れたらルームは終了(ルームID=ホストのPeer IDなので以後
            // 誰も参加できない死んだルームになる。退室ボタン・タブ閉じ・回線断すべて対象)
            if (!this.isLeaving && !this.isHost && conn.peer === this.roomId) {
                this.hangup();
                this.showStatus('ホストが退出したためルームは終了しました', 'error');
                return;
            }
            this.connections.delete(conn.peer);
            this.usernames.delete(conn.peer);
            this.muteStates.delete(conn.peer);
            this.cameraStates.delete(conn.peer);
            this.handStates.delete(conn.peer);
            this.detachRecordingSource(conn.peer);
            this.removeVideoElement(conn.peer);
            if (this.currentRemoteSharerId === conn.peer) {
                this.exitRemotePresenterMode();
            }
            for (const [id, transfer] of this.receivingFiles.entries()) {
                if (transfer.senderId === conn.peer) {
                    transfer.progress.statusEl.textContent = '転送中断';
                    transfer.progress.barInner.style.background = '#dc3545';
                    this.receivingFiles.delete(id);
                }
            }
            if (this.peer) this.updateRoomInfo();
        });

        conn.on('open', () => {
            this.sendStatesTo(conn, { newJoin: true });
            if (this.currentScreenStream) {
                conn.send({ type: 'screen-share-start', peerId: this.peer.id, username: this.username });
            }
            if (this.isHost) {
                const existingPeers = Array.from(this.connections.keys())
                    .filter(id => id !== conn.peer)
                    .map(id => ({ id, username: this.usernames.get(id) || 'ユーザー' }));
                if (existingPeers.length > 0) {
                    conn.send({ type: 'peer-list', peers: existingPeers });
                }
            }
            this.updateRoomInfo();
        });

        conn.on('data', (data) => {
            this.handleDataMessage(data, conn.peer);
        });

        conn.on('close', () => {
            // ホストとの接続が切れたらルームは終了(ルームID=ホストのPeer IDなので以後
            // 誰も参加できない死んだルームになる。退室ボタン・タブ閉じ・回線断すべて対象)
            if (!this.isLeaving && !this.isHost && conn.peer === this.roomId) {
                this.hangup();
                this.showStatus('ホストが退出したためルームは終了しました', 'error');
                return;
            }
            this.connections.delete(conn.peer);
            this.usernames.delete(conn.peer);
            this.muteStates.delete(conn.peer);
            this.cameraStates.delete(conn.peer);
            this.handStates.delete(conn.peer);
            this.detachRecordingSource(conn.peer);
            this.removeVideoElement(conn.peer);
            if (this.currentRemoteSharerId === conn.peer) {
                this.exitRemotePresenterMode();
            }
            // Clean up any pending file transfers from this peer
            for (const [id, transfer] of this.receivingFiles.entries()) {
                if (transfer.senderId === conn.peer) {
                    transfer.progress.statusEl.textContent = '転送中断';
                    transfer.progress.barInner.style.background = '#dc3545';
                    this.receivingFiles.delete(id);
                }
            }
            if (!this.peer) return; // hangup済みなら何もしない
            this.updateRoomInfo();
        });
    }

    // 現在の自分の状態(ユーザー名・ミュート・カメラ・挙手・録音中)を指定接続へ送る。
    // 新規接続確立時と、復帰ピアからのstate-sync-request応答時の双方から使う。
    // screen-share-startとpeer-listはここに含めない(再同期で送ると後勝ち逆転や
    // 不要な再ダイヤルのリスクがあるため。この2つは既存の修復経路が別にある)
    sendStatesTo(conn, { newJoin = false } = {}) {
        conn.send({ type: 'user-join', username: this.username });
        conn.send({ type: 'mute-state', muted: this.isAudioMuted });
        const cameraEnabled = this.localStream?.getVideoTracks()[0]?.enabled ?? true;
        conn.send({ type: 'camera-state', enabled: cameraEnabled });
        conn.send({ type: 'hand-state', raised: this.isHandRaised });
        // newJoinの時だけjoinフラグを付け、受信側で「録音中の部屋への途中参加」と
        // 「フォアグラウンド復帰時の通常の再同期」を区別できるようにする
        if (this.isRecording) conn.send({ type: 'recording-state', recording: true, join: newJoin });
        // 共有メモの現在内容も送る(後入り・復帰ピアが同じメモを見られるように)。
        // 受信側の後勝ち判定(rev)により、古い内容が新しい内容を巻き戻すことはない
        if (this.memoText) conn.send({ type: 'memo-update', rev: this.memoRev, text: this.memoText });
    }

    handleIncomingCall(call) {
        // ロック中は、データ接続を経ずに直接かかってきた新規コールも拒否する
        // (正規フローはhandleConnectionの門番で既に弾かれるが、改造クライアント対策)
        if (this.isHost && this.roomLocked && !this.connections.has(call.peer)) { call.close(); return; }
        // Reject calls from unknown peers when at capacity
        if (!this.connections.has(call.peer) && this.connections.size >= 5) {
            call.close();
            return;
        }
        call.answer(this.getOutgoingStream());
        this.handleCall(call);
    }

    handleCall(call) {
        // Close any existing call from the same peer before replacing
        const existing = this.calls.get(call.peer);
        if (existing) existing.close();
        this.calls.set(call.peer, call);

        call.on('stream', (remoteStream) => {
            if (this.isLeaving || !this.peer) return; // hangup済みなら何もしない(遅延streamでタイル/解析が復活するのを防ぐ)
            if (this.calls.get(call.peer) !== call) return; // 置き換え済みの旧callの遅延streamが新callのタイルを上書きするのを防ぐ
            const label = this.usernames.get(call.peer) || call.peer;
            this.addVideoElement(call.peer, remoteStream, label);
            // 発話インジケーター: このリモートの受信ストリームに解析を接続
            this.attachSpeakingAnalyser(call.peer, remoteStream);
            // 録音中に新しく届いたリモート音声もミックスへ追加する(遅延参加・再接続対応)
            if (this.isRecording) this.attachRecordingSource(call.peer, remoteStream);
            // 画面共有中に遅れて参加した場合、共有画面を大画面に反映する
            if (this.currentRemoteSharerId === call.peer) {
                this.screenShareVideo.srcObject = remoteStream;
                this.screenShareVideo.classList.remove('hidden');
                this.screenSharePlaceholder.classList.add('hidden');
            }
            // 遅れて参加したピアへ、現在送信中の正しいビデオトラックを送る
            if (this.currentScreenStream) {
                const screenTrack = this.currentScreenStream.getVideoTracks()[0];
                const sender = call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
                if (sender && screenTrack) sender.replaceTrack(screenTrack).catch(() => {});
            } else if (this.bgFilterType !== 'none' && this.bgFilterStream) {
                const canvasTrack = this.bgFilterStream.getVideoTracks()[0];
                const sender = call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
                if (sender && canvasTrack) sender.replaceTrack(canvasTrack).catch(() => {});
            }
        });

        call.on('close', () => {
            // 同一ピアのcall置き換え(695-697行)後に旧callのcloseが遅延発火すると、
            // ピアIDだけをキーに生きている新callの登録とタイルを消してしまうため、
            // 自分がまだ現在の登録者である場合のみ片付ける
            if (this.calls.get(call.peer) !== call) return;
            this.calls.delete(call.peer);
            this.removeVideoElement(call.peer);
        });

        call.on('error', (err) => {
            console.error('Call error:', err);
            if (this.calls.get(call.peer) !== call) return; // closeと同じstaleガード
            this.calls.delete(call.peer);
            this.removeVideoElement(call.peer);
        });
    }

    handleDataMessage(data, senderId) {
        switch (data.type) {
            case 'room-full':
                this.hangup();
                this.showStatus('ルームは満員です（最大6人）', 'error');
                break;
            case 'room-locked':
                // ロックの門番はホスト限定(handleConnectionのisHostガード)なので、正規の
                // 送信者は必ずホスト。なりすましで退室させられないようホストIDのみ受理する
                if (!this.isLeaving && !this.isHost && senderId === this.roomId) {
                    this.hangup();
                    this.showStatus('このルームはロックされています', 'error');
                }
                break;
            case 'room-closed':
                // ホストが退室ボタンで明示的にルームを終了した。なりすまし防止のため
                // ホストID(=ルームID)からのメッセージのみ受理する
                if (!this.isLeaving && !this.isHost && senderId === this.roomId) {
                    this.hangup();
                    this.showStatus('ホストが退出したためルームは終了しました', 'error');
                }
                break;
            case 'peer-leaving':
                // 明示退室の通知。senderId本人のクリーンアップしかしないため詐称の危険はない
                this.cleanupPeer(senderId);
                break;
            case 'chat':
                if (!this._allowMessage(senderId)) break; // 連投フラッディング対策
                // 発言者名は自己申告(data.username)ではなく真正な名簿から解決する(なりすまし防止)。
                // 巨大メッセージによるDOM肥大を防ぐため2000字で切り詰める。
                this.displayChatMessage(this.usernames.get(senderId) || 'ユーザー', String(data.message ?? '').slice(0, 2000));
                break;
            case 'user-join': {
                // 巨大ユーザー名によるDOM肥大対策で50字に切り詰める
                const uname = String(data.username ?? 'ユーザー').slice(0, 50);
                this.usernames.set(senderId, uname);
                const labelDiv = document.querySelector(`#video-${senderId} .video-label`);
                if (labelDiv) labelDiv.textContent = uname;
                const centerName = document.querySelector(`#video-${senderId} .video-center-name`);
                if (centerName) centerName.textContent = uname;
                break;
            }
            case 'peer-list':
                // peer-listはホストのみが送る設計。なりすまし防止のためホストID(=ルームID)のみ受理する
                if (senderId !== this.roomId) break;
                data.peers.forEach(({ id, username }) => {
                    if (!this.connections.has(id) && id !== this.peer.id) {
                        if (username) this.usernames.set(id, username);
                        this.connectToPeer(id);
                    }
                });
                break;
            case 'mute-state':
                this.muteStates.set(senderId, data.muted);
                this.setMuteIndicator(senderId, data.muted);
                break;
            case 'state-sync-request':
                // フォアグラウンド復帰したピアからの再同期要求。自分の現在状態を送り返す
                if (!this._allowMessage(senderId)) break; // 連投フラッディング対策
                {
                    const conn = this.connections.get(senderId);
                    if (conn && conn.open) this.sendStatesTo(conn);
                }
                break;
            case 'reaction':
                if (!this._allowMessage(senderId)) break; // 連打フラッディング対策
                // 任意文字列を画面に流させないため許可リストの絵文字のみ表示する
                if (this.REACTION_EMOJIS.includes(data.emoji)) {
                    const name = this.usernames.get(senderId) || 'ユーザー';
                    this.showReactionOverlay(name, data.emoji);
                }
                break;
            case 'hand-state': {
                this.handStates.set(senderId, data.raised);
                this.setHandIndicator(senderId, data.raised);
                if (data.raised) {
                    const name = this.usernames.get(senderId) || 'ユーザー';
                    this.showStatus(`${name}さんが挙手しました`, 'connected');
                }
                break;
            }
            case 'recording-state': {
                if (!this._allowMessage(senderId)) break; // 連投フラッディング対策
                const rec = !!data.recording;
                if (rec) this.recordingStates.set(senderId, true);
                else this.recordingStates.delete(senderId);
                this.updateRecordingIndicator();
                // 送信者名は自己申告(data.username)ではなく真正な名簿から解決する(なりすまし防止)
                const name = this.usernames.get(senderId) || 'ユーザー';
                // 録音中の部屋への途中参加は、常時点滅ピル(受動的)だけだと見落とされうるため、
                // 参加した瞬間だけ気づける一度きりの確認トースト(OKタップで消える)を出す
                if (rec && data.join) {
                    this.showRecordingJoinNotice(name);
                } else {
                    this.showStatus(rec ? `${name}さんが録音を開始しました` : `${name}さんが録音を終了しました`, rec ? 'error' : 'connected');
                }
                break;
            }
            case 'camera-state': {
                this.cameraStates.set(senderId, data.enabled);
                const cn = document.querySelector(`#video-${senderId} .video-center-name`);
                if (cn) cn.style.display = data.enabled ? 'none' : 'block';
                const tile = document.getElementById(`video-${senderId}`);
                if (tile) tile.classList.toggle('camera-off', !data.enabled);
                break;
            }
            case 'screen-share-start':
                // なりすまし防止: 本文のpeerIdではなく実際の送信元(senderId)を共有者として扱う
                // (自己ID詐称による固着やセレクタへの不正文字混入も同時に防ぐ)
                this.enterRemotePresenterMode(senderId, data.username);
                break;
            case 'screen-share-stop':
                // 現在の共有者からの停止通知だけ処理する。共有が重なった場合(A共有中に
                // B開始→A停止)、無条件に解除するとBの共有を見ている全員が誤って解除される。
                if (senderId === this.currentRemoteSharerId) this.exitRemotePresenterMode();
                break;
            case 'memo-update': {
                if (!this._allowMessage(senderId)) break; // 連投フラッディング対策
                const rev = Number(data.rev);
                if (!Number.isFinite(rev) || rev <= 0) break; // 不正なrevは弾く
                // 巨大テキストによるメモリ肥大対策でtextareaのmaxlengthと同じ2万字に切り詰める
                const text = String(data.text ?? '').slice(0, 20000);
                // 後勝ち同期: revが新しいものだけ適用。同revはpeerId辞書順で決定的に
                // タイブレークし、全端末が同じ勝者を選ぶことで内容の食い違いを防ぐ
                const newer = rev > this.memoRev || (rev === this.memoRev && senderId > this.peer.id);
                if (!newer) break;
                this.memoRev = rev; // 自分が次に編集する時はこれより大きいrevで勝てる
                if (this.memoDirty) break; // 自分の入力中は上書きしない(直後の自分の送信が後勝ちで反映される)
                if (text === this.memoText) break;
                this._pushMemoSnapshot(this.memoText); // 上書き前の内容を「戻す」履歴へ
                this.memoText = text;
                this.memoTextarea.value = text;
                this._showMemoDotIfHidden(); // メモタブ非表示中なら更新ドットで知らせる
                break;
            }
            case 'memo-editing': {
                if (!this._allowMessage(senderId)) break; // 連投フラッディング対策
                // 編集者名は自己申告(data.username)ではなく真正な名簿から解決する(なりすまし防止)
                const name = this.usernames.get(senderId) || 'ユーザー';
                this.memoEditingIndicator.textContent = `${name}さんが編集中…（後から書き終えた方が反映されます）`;
                clearTimeout(this._memoEditingTimer);
                this._memoEditingTimer = setTimeout(() => { this.memoEditingIndicator.textContent = ''; }, 3000);
                break;
            }
            case 'file-meta': {
                // 悪意あるピアからの過大/不正なメタ情報を弾く(受信側メモリ膨張・フリーズ対策)。
                // 上限3200 = ceil(200MB / 64KBチャンク)＝送信側sendFileの正規最大チャンク数。
                if (typeof data.id !== 'string' ||
                    !Number.isInteger(data.totalChunks) || data.totalChunks < 1 || data.totalChunks > 3200 ||
                    typeof data.size !== 'number' || data.size < 0 || data.size > 200 * 1024 * 1024) {
                    break;
                }
                const senderName = this.usernames.get(senderId) || senderId;
                const progress = this.createFileProgress(senderName, data.name, '受信中');
                this.receivingFiles.set(data.id, { meta: data, chunks: [], received: 0, progress, senderId });
                break;
            }
            case 'file-chunk':
                if (this.receivingFiles.has(data.id)) {
                    const tf = this.receivingFiles.get(data.id);
                    // indexの範囲外/非整数を弾く(疎配列肥大・進捗偽装対策)
                    if (!Number.isInteger(data.index) || data.index < 0 || data.index >= tf.meta.totalChunks) break;
                    // Use === undefined (not falsy): an empty 0-byte chunk is '' and
                    // must count as received, otherwise empty files report false loss.
                    if (tf.chunks[data.index] === undefined) tf.received++;
                    tf.chunks[data.index] = data.data;
                    this.updateFileProgress(tf.progress, Math.round(tf.received / tf.meta.totalChunks * 100));
                }
                break;
            case 'file-done': {
                const transfer = this.receivingFiles.get(data.id);
                if (!transfer) break;
                this.receivingFiles.delete(data.id);
                const { meta, chunks, progress } = transfer;
                let missing = 0;
                const buffers = [];
                for (let i = 0; i < meta.totalChunks; i++) {
                    if (chunks[i] === undefined) { missing++; continue; }
                    let bin;
                    // 不正なbase64は未捕捉例外でUIを乱さないよう欠損扱いにする
                    try { bin = atob(chunks[i]); } catch (e) { missing++; continue; }
                    const buf = new Uint8Array(bin.length);
                    for (let j = 0; j < bin.length; j++) buf[j] = bin.charCodeAt(j);
                    buffers.push(buf);
                }
                if (missing > 0) {
                    progress.statusEl.textContent = `受信エラー（${missing}チャンク欠損）`;
                    progress.barInner.style.background = '#dc3545';
                    break;
                }
                const blob = new Blob(buffers, { type: meta.mimeType || 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                this.finalizeFileProgress(progress, meta.name, meta.size, url);
                break;
            }
        }
    }

    // 指定ピアのセッション状態を即座に片付ける(明示退室'peer-leaving'受信時と、
    // 定員判定前のゴースト掃除で使用)。conn/callのcloseで後から届く遅延close/error
    // イベントは、Mapから消えていること(callはidentityガード)により実質no-opになる
    cleanupPeer(peerId) {
        const conn = this.connections.get(peerId);
        if (conn) { try { conn.close(); } catch (e) {} }
        const call = this.calls.get(peerId);
        if (call) { try { call.close(); } catch (e) {} }
        this.connections.delete(peerId);
        this.calls.delete(peerId);
        this.usernames.delete(peerId);
        this.muteStates.delete(peerId);
        this.cameraStates.delete(peerId);
        this.handStates.delete(peerId);
        this.detachRecordingSource(peerId);
        this.removeVideoElement(peerId);
        if (this.currentRemoteSharerId === peerId) {
            this.exitRemotePresenterMode();
        }
        for (const [id, transfer] of this.receivingFiles.entries()) {
            if (transfer.senderId === peerId) {
                transfer.progress.statusEl.textContent = '転送中断';
                transfer.progress.barInner.style.background = '#dc3545';
                this.receivingFiles.delete(id);
            }
        }
        if (this.peer) this.updateRoomInfo();
    }

    updateRoomInfo() {
        this.roomInfoDiv.classList.remove('hidden');
        this.renderRoomIdDisplay();
        this.participantCount.textContent = this.connections.size + 1;
        this.usernameCurrentDisplay.textContent = this.username;
        // ルームロックはホストの門番なので、トグルはホスト限定で表示する
        this.roomLockBtn.classList.toggle('hidden', !this.isHost);
    }

    // ルームIDは既定で伏字(●を実際の長さだけ並べる)。タップで表示/非表示をトグルする
    renderRoomIdDisplay() {
        if (!this.roomId) return;
        this.roomIdDisplay.textContent = this.roomIdRevealed ? this.roomId : '●'.repeat(this.roomId.length);
    }

    // ホスト限定。ロック中は新規参加(handleConnection)を拒否する(既存メンバーは無影響)
    toggleRoomLock() {
        if (!this.isHost) return;
        this.roomLocked = !this.roomLocked;
        this.roomLockBtn.classList.toggle('locked', this.roomLocked);
        this.roomLockBtn.classList.toggle('active', this.roomLocked);
        this.roomLockBtn.title = this.roomLocked ? 'ルームのロックを解除' : 'ルームをロック';
        this.roomLockLabel.textContent = this.roomLocked ? 'ロック中（タップで解除）' : 'ルームをロック';
        this.showStatus(this.roomLocked ? 'ルームをロックしました（新規参加を拒否・今の参加者はそのまま）' : 'ルームのロックを解除しました', 'connected');
    }

    startEditUsername() {
        this.usernameEditInput.value = this.username;
        this.usernameCurrentDisplay.classList.add('hidden');
        this.editUsernameBtn.classList.add('hidden');
        this.usernameEditInput.classList.remove('hidden');
        this.usernameConfirmBtn.classList.remove('hidden');
        this.usernameEditInput.focus();
        this.usernameEditInput.select();
    }

    confirmEditUsername() {
        const newName = this.usernameEditInput.value.trim();
        if (newName && newName !== this.username) {
            this.username = newName;
            const localLabel = document.querySelector('#video-local .video-label');
            if (localLabel) localLabel.textContent = newName;
            const localCenterName = document.querySelector('#video-local .video-center-name');
            if (localCenterName) localCenterName.textContent = newName;
            this.broadcast({ type: 'user-join', username: newName });
        }
        this.exitUsernameEdit();
    }

    exitUsernameEdit() {
        this.usernameCurrentDisplay.textContent = this.username;
        this.usernameCurrentDisplay.classList.remove('hidden');
        this.editUsernameBtn.classList.remove('hidden');
        this.usernameEditInput.classList.add('hidden');
        this.usernameConfirmBtn.classList.add('hidden');
    }

    addVideoElement(id, stream, label) {
        this.removeVideoElement(id);

        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        videoContainer.id = `video-${id}`;
        // 視聴中の共有者のタイルは大画面と同内容のため隠す(音声はこのvideoから出続ける)
        if (id === this.currentRemoteSharerId) videoContainer.classList.add('sharer-tile');

        const video = document.createElement('video');
        video.className = 'video-element';
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true; // Required for iOS Safari
        video.muted = id === 'local';

        const labelDiv = document.createElement('div');
        labelDiv.className = 'video-label';
        labelDiv.textContent = label;

        const muteIndicator = document.createElement('div');
        muteIndicator.className = 'mute-indicator hidden';
        muteIndicator.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/><line x1="20" y1="4" x2="4" y2="20" stroke-width="2.5"/></svg>`;
        if (id === 'local' && this.isAudioMuted) muteIndicator.classList.remove('hidden');
        if (id !== 'local' && this.muteStates.get(id)) muteIndicator.classList.remove('hidden');

        const handIndicator = document.createElement('div');
        handIndicator.className = 'hand-indicator hidden';
        handIndicator.textContent = '✋';
        if (id === 'local' && this.isHandRaised) handIndicator.classList.remove('hidden');
        if (id !== 'local' && this.handStates.get(id)) handIndicator.classList.remove('hidden');

        const centerName = document.createElement('div');
        centerName.className = 'video-center-name';
        centerName.textContent = label;
        centerName.style.display = 'none';
        if (id === 'local') {
            const vt = this.localStream?.getVideoTracks()[0];
            if (vt && !vt.enabled) {
                centerName.style.display = 'block';
                videoContainer.classList.add('camera-off');
            }
        } else if (this.cameraStates.has(id) && !this.cameraStates.get(id)) {
            centerName.style.display = 'block';
            videoContainer.classList.add('camera-off');
        }

        videoContainer.appendChild(video);
        videoContainer.appendChild(labelDiv);
        videoContainer.appendChild(muteIndicator);
        videoContainer.appendChild(handIndicator);
        videoContainer.appendChild(centerName);
        this.videoGrid.appendChild(videoContainer);
        video.play().catch(() => {});
        this.relayoutVideoGrid();
    }

    removeVideoElement(id) {
        // 発話インジケーターのAnalyserを破棄(タイル削除と同時に必ず解放してリークを防ぐ)
        this.detachSpeakingAnalyser(id);
        const videoElement = document.getElementById(`video-${id}`);
        if (videoElement) {
            const video = videoElement.querySelector('video');
            if (video) video.srcObject = null;
            videoElement.remove();
        }
        this.relayoutVideoGrid();
    }

    // PC・横向きiPad(≥769px)で、映像タイルを常に16:9に保ちつつ画面内に最大サイズで収める。
    // 列数とタイル幅を「縦横どちらにも収まる最大の16:9」になるよう算出する(Zoom方式)。
    // モバイル/プレゼンターモードはCSS側に任せる(インラインスタイルを除去)。
    relayoutVideoGrid() {
        const grid = this.videoGrid;
        if (!grid) return;
        const wide = window.matchMedia('(min-width: 769px)').matches;
        const presenter = grid.closest('.call-main')?.classList.contains('presenter-mode');
        const tiles = grid.querySelectorAll('.video-container');
        const N = tiles.length;
        if (presenter || N === 0) {
            grid.style.gridTemplateColumns = '';
            grid.style.removeProperty('--vg-tile');
            tiles.forEach(t => t.style.removeProperty('width'));
            return;
        }
        if (!wide) {
            // モバイル(≤768px)は人数で列数を決定: 1〜2人=1列(顔を大きく)、3人以上=2列(一覧性)。
            // Safari15系(iPad Air2等)はCSS Gridのgrid-template-columns変更を子タイルの
            // 再配置に反映しない描画バグがあり(縦向きで列数が回転するまで固着)、:has()も
            // JSのgrid-template-columnsもdisplay:none→''のツリー再構築でも回避できなかった。
            // そのためモバイルはCSS側でGridではなくflexboxを使い、ここでは各タイルのwidthで
            // 列数を決める(1列=100%/2列=calc(50% - 4px)、gap 8pxの半分)。flexは子のwidth変更を
            // 確実に再レイアウトするためグリッドの固着バグを踏まない。
            grid.style.removeProperty('--vg-tile');
            grid.style.gridTemplateColumns = ''; // 旧ビルドのインラインgrid指定が残っても無効化
            const tileW = (N <= 2) ? '100%' : 'calc(50% - 4px)';
            tiles.forEach(t => { t.style.width = tileW; });
            return;
        }
        tiles.forEach(t => t.style.removeProperty('width')); // モバイルで付与したwidthを解除(PCはCSS varで幅指定)
        const gap = 12;
        const W = grid.clientWidth, H = grid.clientHeight;
        if (W <= 0 || H <= 0) return;
        let best = 0, bestCols = 1;
        for (let cols = 1; cols <= N; cols++) {
            const rows = Math.ceil(N / cols);
            // 縦積み(行数>列数)になる配置は候補から外し、横並びを優先する。
            // 縦長/正方形エリアで2人が1列・3人が1列に積まれる問題を防ぐ。
            // cols=Nなら必ずrows=1なので候補が空になることはない。
            if (rows > cols) continue;
            const cw = (W - gap * (cols - 1)) / cols;
            const ch = (H - gap * (rows - 1)) / rows;
            const w = Math.max(0, Math.min(cw, ch * 16 / 9));
            if (w > best) { best = w; bestCols = cols; }
        }
        grid.style.gridTemplateColumns = `repeat(${bestCols}, auto)`;
        grid.style.setProperty('--vg-tile', Math.floor(best) + 'px');
    }

    sendMessage() {
        const message = this.chatInput.value.trim();
        if (!message) return;

        this.displayChatMessage(this.username, message, true);

        this.broadcast({
            type: 'chat',
            username: this.username,
            message: message
        });

        this.chatInput.value = '';
    }

    displayChatMessage(username, message, isOwn = false) {
        const messageDiv = document.createElement('div');
        const strong = document.createElement('strong');
        strong.textContent = username + ':';
        const span = document.createElement('span');
        span.textContent = ' ' + message;
        messageDiv.appendChild(strong);
        messageDiv.appendChild(span);
        this.chatMessages.appendChild(messageDiv);
        // 大量投稿によるメモリ肥大を防ぐため、表示は直近300件までに保つ
        while (this.chatMessages.childElementCount > 300) {
            this.chatMessages.removeChild(this.chatMessages.firstElementChild);
        }
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        // パネルが開いていてもメモタブ表示中はチャットが見えていないため未読に加算する
        if (!isOwn && (!this.isChatVisible || this.activeChatTab === 'memo')) {
            this.unreadCount++;
            this.updateUnreadBadge();
        }
    }

    updateUnreadBadge() {
        const label = this.unreadCount > 99 ? '99+' : String(this.unreadCount);
        if (this.chatUnreadBadge) {
            this.chatUnreadBadge.textContent = label;
            this.chatUnreadBadge.classList.remove('hidden');
        }
        if (this.chatToggleBadge) {
            this.chatToggleBadge.textContent = label;
            this.chatToggleBadge.classList.remove('hidden');
        }
    }

    clearUnreadBadge() {
        this.unreadCount = 0;
        if (this.chatUnreadBadge) {
            this.chatUnreadBadge.classList.add('hidden');
            this.chatUnreadBadge.textContent = '';
        }
        if (this.chatToggleBadge) {
            this.chatToggleBadge.classList.add('hidden');
            this.chatToggleBadge.textContent = '';
        }
    }

    // モバイル(≤768px)はボトムシート(.open=表示)、PC/タブレット横向き(≥769px)は
    // 右カラム常時表示で .collapsed=非表示。レイアウトで開閉の極性が逆なので判定を分ける。
    isChatCurrentlyOpen() {
        if (!this.chatContainer) return false;
        if (window.matchMedia('(max-width: 768px)').matches) {
            return this.chatContainer.classList.contains('open');
        }
        return !this.chatContainer.classList.contains('collapsed');
    }

    toggleChat() {
        if (!this.chatContainer) return;
        if (this.isChatCurrentlyOpen()) {
            this.closeChat();
        } else {
            this.openChat();
        }
    }

    openChat() {
        if (!this.chatContainer) return;
        this.chatContainer.classList.add('open');
        this.chatContainer.classList.remove('collapsed');
        // メモタブ表示中に開いた場合、チャットは見えていないので未読は消さない
        if (this.activeChatTab === 'memo') {
            this.memoDot.classList.add('hidden');
        } else {
            this.isChatVisible = true;
            this.clearUnreadBadge();
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        }
        this.relayoutVideoGrid();
    }

    closeChat() {
        if (!this.chatContainer) return;
        this.chatContainer.classList.remove('open');
        this.chatContainer.classList.add('collapsed');
        this.isChatVisible = false;
        this.relayoutVideoGrid();
    }

    // ===== 共有メモ =====
    // チャットパネル内のタブ切替('chat' | 'memo')。チャットビュー(#chat-messages+入力欄)と
    // メモビュー(#memo-view)の表示を排他にする。パネル自体の開閉ロジックには手を触れない。
    switchChatTab(tab) {
        this.activeChatTab = tab;
        const isMemo = tab === 'memo';
        this.chatTabBtn.classList.toggle('active', !isMemo);
        this.memoTabBtn.classList.toggle('active', isMemo);
        this.chatMessages.classList.toggle('hidden', isMemo);
        this.chatInputContainer.classList.toggle('hidden', isMemo);
        this.memoView.classList.toggle('hidden', !isMemo);
        if (isMemo) {
            // メモが見えたので更新ドットを消す(チャット未読はそのまま保持する)
            this.memoDot.classList.add('hidden');
        } else {
            // チャットタブに戻ったら(パネルが開いていれば)未読を消して最新までスクロール
            if (this.isChatCurrentlyOpen()) {
                this.isChatVisible = true;
                this.clearUnreadBadge();
            }
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        }
    }

    // メモ入力のたびに呼ばれる。全文送信は800msデバウンス、
    // 「編集中…」シグナルは2秒スロットルで送信頻度を抑える。
    onMemoInput() {
        this.memoDirty = true;
        const now = Date.now();
        if (now - this._memoEditingSignalAt >= 2000) {
            this._memoEditingSignalAt = now;
            this.broadcast({ type: 'memo-editing' });
        }
        clearTimeout(this._memoDebounceTimer);
        this._memoDebounceTimer = setTimeout(() => this._flushMemoUpdate(), 800);
    }

    // デバウンス確定: revを進めて全文をbroadcastする(受信側は後勝ちで適用)
    _flushMemoUpdate() {
        this._memoDebounceTimer = null;
        const text = this.memoTextarea.value.slice(0, 20000);
        this.memoDirty = false;
        if (text === this.memoText) return;
        this._pushMemoSnapshot(this.memoText); // 送信前の旧内容を「戻す」履歴へ
        this.memoRev++;
        this.memoText = text;
        this.broadcast({ type: 'memo-update', rev: this.memoRev, text: this.memoText });
    }

    // 「戻す」用の履歴に直前テキストを積む(最大10件・直前と同一なら積まない)
    _pushMemoSnapshot(text) {
        if (this.memoSnapshots[this.memoSnapshots.length - 1] === text) return;
        this.memoSnapshots.push(text);
        if (this.memoSnapshots.length > 10) this.memoSnapshots.shift();
        this._updateMemoUndoBtn();
    }

    _updateMemoUndoBtn() {
        this.memoUndoBtn.disabled = this.memoSnapshots.length === 0;
    }

    // 「戻す」: 履歴の直前テキストへ戻し、新しい編集としてrevを進めて全員へ伝搬する
    undoMemo() {
        if (this.memoSnapshots.length === 0) return;
        const text = this.memoSnapshots.pop();
        this._updateMemoUndoBtn();
        clearTimeout(this._memoDebounceTimer); // 入力中の未送信分は破棄(undo結果を正とする)
        this._memoDebounceTimer = null;
        this.memoDirty = false;
        this.memoRev++;
        this.memoText = text;
        this.memoTextarea.value = text;
        this.broadcast({ type: 'memo-update', rev: this.memoRev, text: this.memoText });
    }

    // メモをテキストファイルとしてローカル保存する(録音保存と同じ作法)。空白のみなら何もしない
    downloadMemo() {
        const text = this.memoTextarea ? this.memoTextarea.value : this.memoText;
        if (!text.trim()) return;
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const a = document.createElement('a');
        a.href = url;
        a.download = `comchat-memo-${stamp}.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // メモタブが今見えていない(チャットタブ表示中/パネルが閉じている)時だけ更新ドットを出す
    _showMemoDotIfHidden() {
        if (this.activeChatTab === 'memo' && this.isChatCurrentlyOpen()) return;
        this.memoDot.classList.remove('hidden');
    }

    async sendFile(file) {
        const MAX = 200 * 1024 * 1024;
        if (file.size > MAX) {
            this.showStatus('ファイルサイズは200MB以下にしてください', 'error');
            return;
        }
        const idBytes = new Uint8Array(9);
        crypto.getRandomValues(idBytes);
        const idChars = '0123456789abcdefghijklmnopqrstuvwxyz';
        const fileId = Array.from(idBytes, b => idChars[b % 36]).join('');
        const CHUNK = 64 * 1024;
        const BUFFER_HIGH = 512 * 1024;
        this.isSendingFile = true;
        this.fileAttachBtn.disabled = true;
        const progress = this.createFileProgress(this.username, file.name, '送信中');
        try {
            const buffer = await file.arrayBuffer();
            const totalChunks = Math.ceil(buffer.byteLength / CHUNK) || 1;
            this.broadcast({ type: 'file-meta', id: fileId, name: file.name, size: file.size, mimeType: file.type, totalChunks });
            for (let i = 0; i < totalChunks; i++) {
                await this.waitForBuffers(BUFFER_HIGH);
                const slice = new Uint8Array(buffer, i * CHUNK, Math.min(CHUNK, buffer.byteLength - i * CHUNK));
                // Build binary string in 8 KB sub-batches to avoid O(n²) string concat
                // and stack overflow from apply() on large arrays.
                const SAFE = 8192;
                let bin = '';
                for (let j = 0; j < slice.length; j += SAFE) {
                    bin += String.fromCharCode.apply(null, slice.subarray(j, j + SAFE));
                }
                this.broadcast({ type: 'file-chunk', id: fileId, index: i, data: btoa(bin) });
                this.updateFileProgress(progress, Math.round((i + 1) / totalChunks * 100));
            }
            this.broadcast({ type: 'file-done', id: fileId });
            const url = URL.createObjectURL(file);
            this.finalizeFileProgress(progress, file.name, file.size, url);
        } catch (err) {
            console.error('File send error:', err);
            progress.statusEl.textContent = '送信失敗';
            progress.barInner.style.background = '#dc3545';
            this.showStatus('ファイルの送信に失敗しました', 'error');
        } finally {
            this.isSendingFile = false;
            this.fileAttachBtn.disabled = false;
        }
    }

    async waitForBuffers(threshold) {
        const full = [];
        for (const conn of this.connections.values()) {
            try {
                const dc = conn.dataChannel;
                if (dc && dc.bufferedAmount > threshold) full.push(dc);
            } catch {}
        }
        if (full.length === 0) return;
        await Promise.all(full.map(dc => new Promise(resolve => {
            if (!('bufferedAmountLowThreshold' in dc)) { resolve(); return; }
            dc.bufferedAmountLowThreshold = Math.floor(threshold / 2);
            const done = () => resolve();
            dc.addEventListener('bufferedamountlow', done, { once: true });
            setTimeout(() => { dc.removeEventListener('bufferedamountlow', done); resolve(); }, 5000);
        })));
    }

    createFileProgress(username, filename, label) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-file-msg';
        const nameEl = document.createElement('strong');
        nameEl.textContent = username + ':';
        const fileDiv = document.createElement('div');
        fileDiv.className = 'file-info file-progress';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'file-progress-name';
        nameSpan.textContent = filename;
        const statusEl = document.createElement('span');
        statusEl.className = 'file-progress-status';
        statusEl.textContent = `${label}... 0%`;
        const barWrap = document.createElement('div');
        barWrap.className = 'file-progress-bar-wrap';
        const barInner = document.createElement('div');
        barInner.className = 'file-progress-bar';
        barWrap.appendChild(barInner);
        fileDiv.appendChild(nameSpan);
        fileDiv.appendChild(statusEl);
        fileDiv.appendChild(barWrap);
        msgDiv.appendChild(nameEl);
        msgDiv.appendChild(fileDiv);
        this.chatMessages.appendChild(msgDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        return { fileDiv, statusEl, barInner, label };
    }

    updateFileProgress(progress, pct) {
        progress.statusEl.textContent = `${progress.label}... ${pct}%`;
        progress.barInner.style.width = `${pct}%`;
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    finalizeFileProgress(progress, filename, filesize, url) {
        const { fileDiv } = progress;
        fileDiv.classList.remove('file-progress');
        fileDiv.innerHTML = '';
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.textContent = filename;
        link.className = 'file-link';
        const sizeEl = document.createElement('span');
        sizeEl.className = 'file-size';
        sizeEl.textContent = this.formatFileSize(filesize);
        fileDiv.appendChild(link);
        fileDiv.appendChild(sizeEl);
        this.objectURLs.push(url);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    broadcast(data) {
        this.connections.forEach((conn) => {
            if (conn.open) {
                conn.send(data);
            }
        });
    }

    // 悪意あるピアからの表示系メッセージ洪水(チャット・リアクション等)を抑える簡易レート制限。
    // ピアごとに1秒窓で上限20通(人間の操作には十分・改造クライアントの連投は超過分を破棄)。
    // 正規でも高頻度になるファイル転送チャンクは対象外(B-5の境界検証で別途保護)。
    _allowMessage(senderId) {
        const now = Date.now();
        let r = this._msgRate.get(senderId);
        if (!r || now - r.start >= 1000) { r = { start: now, count: 0 }; this._msgRate.set(senderId, r); }
        r.count++;
        return r.count <= 20;
    }

    async toggleVideo() {
        if (!this.localStream) return;
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (!videoTrack) return;
        videoTrack.enabled = !videoTrack.enabled;
        this.toggleVideoBtn.classList.toggle('off', !videoTrack.enabled);
        // When bg filter is active, the sent stream is a canvas capture.
        // Disabling localStream's track freezes the canvas on the last frame.
        // Stop the loop and draw black (off) or resume (on).
        if (this.bgFilterType !== 'none' && this.bgFilterCtx && this.bgFilterCanvas) {
            if (!videoTrack.enabled) {
                this.stopBgFilterLoop();
                this.bgFilterCtx.fillStyle = '#000';
                this.bgFilterCtx.fillRect(0, 0, this.bgFilterCanvas.width, this.bgFilterCanvas.height);
            } else {
                this.imageSegmenter ? this.startBgFilterLoop() : this.startCSSFilterLoop();
            }
        }
        const localCenterName = document.querySelector('#video-local .video-center-name');
        if (localCenterName) localCenterName.style.display = videoTrack.enabled ? 'none' : 'block';
        const localTile = document.getElementById('video-local');
        if (localTile) localTile.classList.toggle('camera-off', !videoTrack.enabled);
        this.broadcast({ type: 'camera-state', enabled: videoTrack.enabled });
    }

    async toggleAudio() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.isAudioMuted = !audioTrack.enabled;
                this.toggleAudioBtn.classList.toggle('off', this.isAudioMuted);
                this.setMuteIndicator('local', this.isAudioMuted);
                this.broadcast({ type: 'mute-state', muted: this.isAudioMuted });
            }
        }
    }

    setMuteIndicator(id, isMuted) {
        const indicator = document.querySelector(`#video-${id} .mute-indicator`);
        if (indicator) indicator.classList.toggle('hidden', !isMuted);
    }

    setHandIndicator(id, raised) {
        const indicator = document.querySelector(`#video-${id} .hand-indicator`);
        if (indicator) indicator.classList.toggle('hidden', !raised);
    }

    // 連打対策で200msスロットル。broadcastは自分に届かないため自分の名前でローカルエコーする。
    sendReaction(emoji) {
        const now = Date.now();
        if (now - this._lastReactionSentAt < 200) return;
        this._lastReactionSentAt = now;
        this.broadcast({ type: 'reaction', emoji });
        this.showReactionOverlay(this.username, emoji);
    }

    // 画面全体のオーバーレイに絵文字+送信者名を浮上表示させ、アニメーション終了
    // (またはその保険のタイムアウト)で必ず1回だけ除去する。二重削除を避けるためremoveは冪等。
    // プレゼンターモードのタイル(overflow:hiddenでクリップされる)に依存しないよう、
    // #reaction-overlay(fixed, 画面全体)に描画する。
    showReactionOverlay(name, emoji) {
        if (!this.reactionOverlay) return;

        // 同時表示は最大12個まで。超えたら最古のものを即座に削除する。
        const existing = this.reactionOverlay.querySelectorAll('.reaction-overlay-item');
        if (existing.length >= 12) existing[0].remove();

        const item = document.createElement('div');
        item.className = 'reaction-overlay-item';

        const emojiSpan = document.createElement('span');
        emojiSpan.className = 'reaction-overlay-emoji';
        emojiSpan.textContent = emoji;

        const nameTag = document.createElement('span');
        nameTag.className = 'reaction-overlay-name';
        // XSS対策: 送信者名は必ずtextContentで挿入する(innerHTMLは使わない)
        nameTag.textContent = name;

        item.appendChild(emojiSpan);
        item.appendChild(nameTag);

        // 連打時に重ならないよう、水平方向の開始位置を画面幅15%〜85%の範囲でランダム化する
        const startPct = 15 + Math.random() * 70;
        item.style.left = startPct + '%';
        // 横揺れ(±20〜30px)もランダム化して同時表示時の見た目の単調さを避ける
        const sway = (20 + Math.random() * 10).toFixed(1);
        item.style.setProperty('--sway', sway + 'px');

        let removed = false;
        const remove = () => {
            if (removed) return;
            removed = true;
            item.remove();
        };
        item.addEventListener('animationend', remove);
        setTimeout(remove, 3300); // 保険: animationendが発火しない場合の二重削除ガード(アニメ2.8s+0.5s)

        this.reactionOverlay.appendChild(item);
    }

    toggleHand() {
        this.isHandRaised = !this.isHandRaised;
        this.setHandIndicator('local', this.isHandRaised);
        this.broadcast({ type: 'hand-state', raised: this.isHandRaised });
        this.updateHandToggleBtn();
    }

    updateHandToggleBtn() {
        if (!this.handToggleBtn) return;
        this.handToggleBtn.textContent = this.isHandRaised ? '✋ 挙手をやめる' : '✋ 挙手';
        this.handToggleBtn.classList.toggle('active', this.isHandRaised);
    }

    async shareScreen() {
        if (this.currentScreenStream) return;
        // iPhone/iPad(iOS・iPadOS Safari)はgetDisplayMedia非対応で画面共有を発信できない。
        // 原因不明の「失敗」に見えないよう、対応端末でないことを明示する(視聴は可能)
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            this.showStatus('この端末は画面共有の発信に対応していません（iPhone/iPad等）。PCからお試しください', 'error');
            return;
        }
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });

            // 開示したまま画面共有を始めると室名IDが映り込むため、共有が確立した瞬間に
            // 強制的に伏字へ戻す(タイマー式ではなく、危険な瞬間にだけピンポイントで効く方式。
            // 会話中はいつまでも開示したままで良い)
            if (this.roomIdRevealed) {
                this.roomIdRevealed = false;
                this.renderRoomIdDisplay();
            }

            const screenVideoTrack = screenStream.getVideoTracks()[0];
            const cameraVideoTrack = this.localStream.getVideoTracks()[0];

            this.currentScreenStream = screenStream;
            this.cameraVideoTrack = cameraVideoTrack;
            // 直前まで他人の共有を視聴していた場合の残留値をクリアする。
            // 残したままだと、旧共有者が譲る際のscreen-share-stop受信ガード
            // (senderId === currentRemoteSharerId)が誤って一致し、
            // 始めたばかりの自分の共有表示を自分で畳んでしまう(後勝ちが成立しない)
            this.currentRemoteSharerId = null;

            // Send screen to remote peers
            this.calls.forEach((call) => {
                const sender = call.peerConnection.getSenders().find(s =>
                    s.track && s.track.kind === 'video'
                );
                if (sender) sender.replaceTrack(screenVideoTrack).catch(() => {});
            });

            // Mix screen (tab/system) audio with mic so peers hear shared audio
            const screenAudioTrack = screenStream.getAudioTracks()[0];
            if (screenAudioTrack) {
                const mixedTrack = this.buildMixedAudioTrack(screenStream);
                if (mixedTrack) {
                    this.calls.forEach((call) => {
                        const sender = call.peerConnection.getSenders().find(s =>
                            s.track && s.track.kind === 'audio'
                        );
                        if (sender) sender.replaceTrack(mixedTrack).catch(() => {});
                    });
                }
            }

            this.screenShareVideo.srcObject = screenStream;
            this.screenShareVideo.muted = true;
            this.screenShareVideo.classList.remove('hidden');
            this.screenSharePlaceholder.classList.add('hidden');
            this.screenShareContainer.classList.remove('hidden');
            this.callMain.classList.add('presenter-mode');
            this.shareViewerLabel.classList.add('hidden');
            this.stopShareBtn.classList.remove('hidden');
            // presenter-mode切替直後に再レイアウト。モバイル3人以上でタイルに付くインラインwidthは
            // サムネイル帯のCSS(width:160px)より優先されるため、ここで即時除去する
            // (ResizeObserverでも後追い除去されるが、発火は非同期で1フレーム乱れる)
            this.relayoutVideoGrid();

            screenVideoTrack.onended = () => this.stopScreenShare();

            this.shareScreenBtn.classList.add('active');
            this.broadcast({ type: 'screen-share-start', peerId: this.peer.id, username: this.username });

        } catch (error) {
            if (error.name !== 'NotAllowedError') {
                this.showStatus('画面共有に失敗しました', 'error');
            }
        }
    }

    enterRemotePresenterMode(sharerPeerId, sharerUsername) {
        // 自分が共有中に他の人が共有を開始したら、自分の共有を停止して譲る(後勝ち)。
        // 止めないと stopShareBtn が隠されて自分の共有を止めるUIが消えてしまう。
        // 自分の stopScreenShare が broadcast する 'screen-share-stop' は、受信側の
        // senderId ガード(現在の共有者のみ処理)により新しい共有者の表示を壊さない。
        if (this.currentScreenStream) this.stopScreenShare();
        this.currentRemoteSharerId = sharerPeerId;

        // 共有者交代(後勝ち)時: 旧共有者のタイルを再表示し、新共有者のタイルを隠す
        document.querySelectorAll('.video-container.sharer-tile').forEach(el => {
            if (el.id !== `video-${sharerPeerId}`) el.classList.remove('sharer-tile');
        });
        const sharerTile = document.getElementById(`video-${sharerPeerId}`);
        if (sharerTile) sharerTile.classList.add('sharer-tile');

        // Audio plays from the sharer's grid thumbnail; mute here to avoid double playback.
        this.screenShareVideo.muted = true;

        const sharerVideoEl = document.querySelector(`#video-${sharerPeerId} .video-element`);
        if (sharerVideoEl && sharerVideoEl.srcObject) {
            this.screenShareVideo.srcObject = sharerVideoEl.srcObject;
            this.screenShareVideo.classList.remove('hidden');
            this.screenSharePlaceholder.classList.add('hidden');
        } else {
            this.screenShareVideo.classList.add('hidden');
            this.screenSharePlaceholder.classList.remove('hidden');
        }

        this.screenShareContainer.classList.remove('hidden');
        this.callMain.classList.add('presenter-mode');
        this.stopShareBtn.classList.add('hidden');

        this.shareViewerLabel.textContent = `${sharerUsername || sharerPeerId} が共有中`;
        this.shareViewerLabel.classList.remove('hidden');
        this.shareViewerLabel.style.position = '';
        this.shareViewerLabel.style.bottom = '';
        this.shareViewerLabel.style.left = '';
        this.shareViewerLabel.style.zIndex = '';
        this.relayoutVideoGrid();
    }

    exitRemotePresenterMode() {
        this.currentRemoteSharerId = null;
        const v = this.screenShareVideo;
        const finish = () => {
            // 片付け待ちの間に新しい共有が始まっていたら、古い後始末で新しい表示を壊さない
            if (this.currentRemoteSharerId) return;
            v.srcObject = null;
            v.classList.add('hidden');
            this.screenSharePlaceholder.classList.add('hidden');
            this.screenShareContainer.classList.add('hidden');
            this.callMain.classList.remove('presenter-mode');
            this.shareViewerLabel.classList.add('hidden');
            document.querySelectorAll('.video-container.sharer-tile').forEach(el => el.classList.remove('sharer-tile'));
            this.relayoutVideoGrid();
        };
        if (v.webkitPresentationMode === 'picture-in-picture' && v.webkitSetPresentationMode) {
            // iOSのPiP(ネイティブ全画面中にホームへスワイプ等で自動移行)中は
            // webkitDisplayingFullscreenがfalseになり下の全画面分岐を素通りするため、
            // 即時片付けでPiPプレイヤーの残骸がホーム画面に取り残されていた(実機確認)。
            // PiP終了完了(presentationmodechangedでinline)を待ってから片付ける
            let done = false;
            const onModeChange = () => {
                if (done || v.webkitPresentationMode !== 'inline') return;
                done = true;
                v.removeEventListener('webkitpresentationmodechanged', onModeChange);
                finish();
            };
            v.addEventListener('webkitpresentationmodechanged', onModeChange);
            try { v.webkitSetPresentationMode('inline'); } catch (e) {}
            setTimeout(() => {
                if (done) return;
                done = true;
                v.removeEventListener('webkitpresentationmodechanged', onModeChange);
                finish();
            }, 2000); // 保険: イベントが来なくても最終的に片付ける
        } else if (v.webkitDisplayingFullscreen && v.webkitExitFullscreen) {
            // iPhoneのネイティブ全画面中にsrcObject=nullやdisplay:noneを即時に行うと、
            // 非同期の全画面終了処理が中断されて真っ黒なプレイヤーがiOSに取り残される
            // (Safari終了後もシステム層に残骸が残り、デコーダを掴んだままになるため
            // 再入室後の映像まで黒くなる)。webkitendfullscreen(終了完了)を待ってから片付ける
            let done = false;
            const onEnd = () => {
                if (done) return;
                done = true;
                v.removeEventListener('webkitendfullscreen', onEnd);
                finish();
            };
            v.addEventListener('webkitendfullscreen', onEnd);
            try { v.webkitExitFullscreen(); } catch (e) {}
            setTimeout(onEnd, 2000); // 保険: endfullscreenが来なくても最終的に片付ける
        } else {
            this.exitScreenShareFullscreen();
            finish();
        }
    }

    stopScreenShare() {
        if (!this.currentScreenStream) return;
        this.exitScreenShareFullscreen();

        this.currentScreenStream.getTracks().forEach(t => t.stop());

        // Restore remote peers to camera (or canvas if filter is active)
        const restoreTrack = (this.bgFilterType !== 'none' && this.bgFilterStream)
            ? this.bgFilterStream.getVideoTracks()[0]
            : this.cameraVideoTrack;
        this.calls.forEach((call) => {
            const sender = call.peerConnection.getSenders().find(s =>
                s.track && s.track.kind === 'video'
            );
            if (sender && restoreTrack) sender.replaceTrack(restoreTrack).catch(() => {});
        });

        // Restore mic-only audio if it was mixed with screen audio
        if (this.mixedAudioTrack) {
            const micTrack = this.localStream?.getAudioTracks()[0];
            this.calls.forEach((call) => {
                const sender = call.peerConnection.getSenders().find(s =>
                    s.track && s.track.kind === 'audio'
                );
                if (sender && micTrack) sender.replaceTrack(micTrack).catch(() => {});
            });
            this.teardownMixedAudio();
        }

        // Restore grid layout
        this.screenShareVideo.srcObject = null;
        this.screenShareVideo.classList.add('hidden');
        this.screenSharePlaceholder.classList.add('hidden');
        this.screenShareContainer.classList.add('hidden');

        this.callMain.classList.remove('presenter-mode');
        this.stopShareBtn.classList.add('hidden');
        this.relayoutVideoGrid();
        this.currentScreenStream = null;
        this.shareScreenBtn.classList.remove('active');
        this.broadcast({ type: 'screen-share-stop' });
        this.cameraVideoTrack = null;
    }

    toggleScreenShareFullscreen() {
        const container = this.screenShareContainer;
        const video = this.screenShareVideo;
        const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        if (fsEl === container) {
            if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            return;
        }
        // ① 標準Fullscreen API(Mac/iPad/Windows) ② 旧Safari(2011 MBA等)のwebkit接頭辞
        // ③ iPhone: 要素フルスクリーン非対応のためvideoのネイティブ全画面(自動で横回転も効く)
        if (document.fullscreenEnabled && container.requestFullscreen) {
            container.requestFullscreen().catch(() => {});
        } else if (document.webkitFullscreenEnabled && container.webkitRequestFullscreen) {
            container.webkitRequestFullscreen();
        } else if (video.webkitEnterFullscreen) {
            // 動画が未再生だとInvalidStateErrorを投げることがあるため握りつぶす
            try { video.webkitEnterFullscreen(); } catch (e) {}
        }
    }

    exitScreenShareFullscreen() {
        // 共有終了・退室時に全画面のまま取り残さないための後始末
        const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        if (fsEl === this.screenShareContainer) {
            if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
        // iPhoneのネイティブ全画面(webkitEnterFullscreen)中ならこちらで閉じる
        const v = this.screenShareVideo;
        if (v.webkitDisplayingFullscreen && v.webkitExitFullscreen) v.webkitExitFullscreen();
        // iOSのPiP中なら通常表示へ戻す(共有者側はiPhone非対応のため主に保険)
        if (v.webkitPresentationMode === 'picture-in-picture' && v.webkitSetPresentationMode) {
            try { v.webkitSetPresentationMode('inline'); } catch (e) {}
        }
    }

    buildMixedAudioTrack(screenStream) {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return null;
            const ctx = new AudioCtx();
            const dest = ctx.createMediaStreamDestination();

            const micTrack = this.localStream?.getAudioTracks()[0];
            if (micTrack) {
                const micSource = ctx.createMediaStreamSource(new MediaStream([micTrack]));
                micSource.connect(dest);
                this.mixSources.push(micSource);
            }
            const screenAudioTrack = screenStream.getAudioTracks()[0];
            if (screenAudioTrack) {
                const screenSource = ctx.createMediaStreamSource(new MediaStream([screenAudioTrack]));
                screenSource.connect(dest);
                this.mixSources.push(screenSource);
            }

            this.mixAudioContext = ctx;
            this.mixedAudioTrack = dest.stream.getAudioTracks()[0];
            return this.mixedAudioTrack;
        } catch {
            this.teardownMixedAudio();
            return null;
        }
    }

    teardownMixedAudio() {
        this.mixSources.forEach(s => { try { s.disconnect(); } catch {} });
        this.mixSources = [];
        if (this.mixedAudioTrack) { try { this.mixedAudioTrack.stop(); } catch {} }
        this.mixedAudioTrack = null;
        if (this.mixAudioContext) { try { this.mixAudioContext.close(); } catch {} }
        this.mixAudioContext = null;
    }

    // ===== 録音 (全員のマイク音声をミックスしてローカル保存) =====
    // 画面共有ミックス(mixAudioContext)・発話解析(speakingAudioContext)とは別インスタンスにする
    // (このプロジェクトの作法: 用途別にAudioContextを分離する。ensureSpeakingAudioContext参照)

    // 録音中のピア音声トラックをミックス先へ接続する。同一peerIdのsourceが既にあれば
    // 先にdisconnectしてから置き換える(再接続・callの張り直しでの二重ミックス防止)。
    attachRecordingSource(peerId, stream) {
        if (!this.recAudioContext || !this.recDest) return;
        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack) return;
        const existing = this.recSources.get(peerId);
        if (existing) { try { existing.disconnect(); } catch {} }
        try {
            const source = this.recAudioContext.createMediaStreamSource(new MediaStream([audioTrack]));
            source.connect(this.recDest);
            this.recSources.set(peerId, source);
        } catch {}
    }

    // ピア退場時、録音ミックスから当該ピアの音声を切り離す(録音自体は継続)。
    // 併せて「そのピアが録音中」インジケーター状態も消す(相手はもう居ないため)。
    detachRecordingSource(peerId) {
        const source = this.recSources.get(peerId);
        if (source) { try { source.disconnect(); } catch {} }
        this.recSources.delete(peerId);
        const hadState = this.recordingStates.delete(peerId);
        if (hadState) this.updateRecordingIndicator();
    }

    // 経過時間を mm:ss 形式にする(録音インジケーター用)
    _formatRecTime(ms) {
        const totalSec = Math.floor(ms / 1000);
        const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
        const s = String(totalSec % 60).padStart(2, '0');
        return `${m}:${s}`;
    }

    // 自分の録音経過時間 + リモートの録音中インジケーターを1箇所にまとめて描画する。
    // 状態変化のたび(開始/停止/ピア増減/1秒毎のタイマー)に呼ぶ。
    updateRecordingIndicator() {
        if (!this.recordingIndicator) return;
        const parts = [];
        if (this.isRecording) {
            const elapsed = this._formatRecTime(Date.now() - this.recStartTime);
            parts.push(`🔴 録音中 ${elapsed}`);
        }
        if (this.recordingStates.size > 0) {
            const names = Array.from(this.recordingStates.keys())
                .map(id => this.usernames.get(id) || 'ユーザー');
            parts.push(`🔴 ${names.join('、')}さんが録音中`);
        } else {
            // リモートの録音者がゼロになったら、未タップの録音参加確認トーストも撤去する。
            // ここは録音停止・録音者の退場・自分のhangupの全経路で必ず呼ばれる合流点なので、
            // 「録音していないのに録音中と出続ける」残留をこの1箇所で防げる
            document.querySelectorAll('.recording-join-toast').forEach(t => t.remove());
        }
        if (parts.length === 0) {
            this.recordingIndicator.classList.add('hidden');
            this.recordingIndicator.textContent = '';
            return;
        }
        this.recordingIndicator.textContent = parts.join('　');
        this.recordingIndicator.classList.remove('hidden');
    }

    async startRecording() {
        if (this.isRecording) return;
        if (!window.MediaRecorder) {
            this.showStatus('この端末は録音に対応していません', 'error');
            return;
        }
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) {
                this.showStatus('この端末は録音に対応していません', 'error');
                return;
            }
            this.recAudioContext = new AudioCtx();
            // 自動再生ポリシー等でsuspendedのまま生成されると無音ファイルになるため念のため起こす
            // (クリックハンドラ内なので通常はrunningだが、ensureSpeakingAudioContextと同じ配慮)
            if (this.recAudioContext.state === 'suspended') {
                this.recAudioContext.resume().catch(() => {});
            }
            this.recDest = this.recAudioContext.createMediaStreamDestination();
            this.recSources.clear();

            // 自分のマイク音声を接続(マイクミュート中はtrack.enabled=falseの自然な挙動で
            // 無音になる=仕様として許容する)
            const micTrack = this.localStream?.getAudioTracks()[0];
            if (micTrack) {
                const micSource = this.recAudioContext.createMediaStreamSource(new MediaStream([micTrack]));
                micSource.connect(this.recDest);
                this.recSources.set('__self__', micSource);
            }
            // 全リモートピアの音声を接続(自分が画面共有中でも、共有音声は録音ミックスに
            // 含めない=v1の割り切り。ここではcall.remoteStreamのマイク由来トラックのみを使う)
            this.calls.forEach((call, peerId) => {
                if (call.remoteStream) this.attachRecordingSource(peerId, call.remoteStream);
            });

            // mimeType選択: MP4(.m4a)優先、次点でWebM(Opus)、どちらも不可なら既定(.webm)
            let mimeType = '';
            let ext = 'webm';
            if (MediaRecorder.isTypeSupported('audio/mp4')) {
                mimeType = 'audio/mp4';
                ext = 'm4a';
            } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                mimeType = 'audio/webm;codecs=opus';
                ext = 'webm';
            }
            this._recFileExt = ext;

            this.recordingChunks = [];
            this.mediaRecorder = mimeType
                ? new MediaRecorder(this.recDest.stream, { mimeType })
                : new MediaRecorder(this.recDest.stream);

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) this.recordingChunks.push(e.data);
            };
            this.mediaRecorder.onstop = () => {
                // ファイル保存をonstopに一元化することで、停止ボタンでも退室(hangup)でも
                // 確実に保存される
                this.saveRecordingFile();
                this.stopRecordingCleanup();
            };
            this.mediaRecorder.start(1000); // 1秒タイムスライス

            this.isRecording = true;
            this.recStartTime = Date.now();
            this.recTimerInterval = setInterval(() => this.updateRecordingIndicator(), 1000);
            this.broadcast({ type: 'recording-state', recording: true });
            this.showStatus('録音を開始しました（全員に通知されます）', 'error');
            this.recordBtn.classList.add('active', 'recording-active');
            this.recordLabel.textContent = '録音を停止';
            this.updateRecordingIndicator();
        } catch (error) {
            this.stopRecordingCleanup();
            this.showStatus('録音を開始できませんでした', 'error');
        }
    }

    stopRecording() {
        if (!this.isRecording || !this.mediaRecorder) return;
        // 状態フラグの反転とbroadcast/通知はここで同期的に行う。mediaRecorder.onstopは
        // 次のイベントループまで発火しないため、hangup()から呼ばれた場合はこの後すぐ
        // conn.close()が走る。onstop側に broadcast を任せると、その時点で接続が
        // 既に閉じておりrecording-state:falseが相手に届かない(インジケーターが残留する)。
        this.isRecording = false;
        this.broadcast({ type: 'recording-state', recording: false });
        this.showStatus('録音を終了しました', 'connected');
        this.recordBtn.classList.remove('active', 'recording-active');
        this.recordLabel.textContent = '録音を開始';
        this.updateRecordingIndicator();
        // stop()を呼ぶとonstop内でBlob保存→リソース後始末、の順に進む(後始末を先にやると
        // 録音データが失われるため、onstop経由の一元化フローに任せる)
        try { this.mediaRecorder.stop(); } catch {
            this.stopRecordingCleanup();
        }
    }

    // 録音データをBlobにまとめてダウンロードさせる(onstopから呼ばれる)
    saveRecordingFile() {
        if (this.recordingChunks.length === 0) return;
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.recordingChunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const ext = this._recFileExt || 'webm';
        const a = document.createElement('a');
        a.href = url;
        a.download = `comchat-recording-${stamp}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // 録音リソースの後始末(AudioContext/Source/タイマー等)。状態フラグの反転とbroadcastは
    // stopRecording()側で同期的に済ませてあるため、ここでは純粋なリソース解放のみ行う。
    // mediaRecorder.onstopの発火(Blob保存)を妨げないよう、stop()呼び出し→onstop内で
    // これを呼ぶ、という順序で使う(startRecording失敗時のロールバックにも流用)。
    stopRecordingCleanup() {
        this.recSources.forEach(s => { try { s.disconnect(); } catch {} });
        this.recSources.clear();
        if (this.recAudioContext) { try { this.recAudioContext.close(); } catch {} }
        this.recAudioContext = null;
        this.recDest = null;
        this.mediaRecorder = null;
        this.recordingChunks = [];
        if (this.recTimerInterval) { clearInterval(this.recTimerInterval); this.recTimerInterval = null; }
        this.isRecording = false;
        this.recStartTime = 0;

        this.recordBtn.classList.remove('active', 'recording-active');
        this.recordLabel.textContent = '録音を開始';
        this.updateRecordingIndicator();
    }

    // ===== 発話インジケーター (active speaker detection) =====
    // しきい値・ヒステリシスの設定値
    static get SPEAK_ON_RMS() { return 0.045; }   // これ以上のRMSで発話とみなす(環境ノイズで誤点灯しない程度)
    static get SPEAK_OFF_RMS() { return 0.030; }  // 一度点灯後、これを下回ると無音判定を開始(ヒステリシス)
    static get SPEAK_HOLD_MS() { return 500; }    // 無音がこの時間続いたら消灯(ちらつき防止)
    static get SPEAK_INTERVAL_MS() { return 150; }// 全員を計測するループ間隔

    // 解析専用のAudioContextを用意する。通話開始(ユーザージェスチャ後)に呼ばれる。
    // 画面共有の音声ミックス(mixAudioContext)とは別インスタンスにして干渉を避ける。
    ensureSpeakingAudioContext() {
        if (!this.speakingAudioContext) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return null;
            try {
                this.speakingAudioContext = new AudioCtx();
            } catch {
                this.speakingAudioContext = null;
                return null;
            }
        }
        // Safari等ではユーザージェスチャ直後でもsuspendedで生成されることがある
        if (this.speakingAudioContext.state === 'suspended') {
            this.speakingAudioContext.resume().catch(() => {});
            // iOSでアクティベーション失効によりresumeできない場合、次のユーザー操作で再試行する
            this.registerSpeakingResumeRetry();
        }
        return this.speakingAudioContext;
    }

    // suspendedのままのAudioContextを、ユーザー操作(pointerdown)を契機にresumeし直す。
    // 成功(running)またはteardownで解除。多重登録はしない。
    registerSpeakingResumeRetry() {
        if (this._speakingResumeHandler) return;
        this._speakingResumeHandler = () => {
            const ctx = this.speakingAudioContext;
            if (!ctx || ctx.state === 'closed') {
                this.unregisterSpeakingResumeRetry();
                return;
            }
            if (ctx.state === 'suspended') {
                ctx.resume().then(() => this.unregisterSpeakingResumeRetry()).catch(() => {});
            } else {
                this.unregisterSpeakingResumeRetry();
            }
        };
        this._speakingResumeEvent = window.PointerEvent ? 'pointerdown' : 'touchend';
        document.addEventListener(this._speakingResumeEvent, this._speakingResumeHandler);
    }

    unregisterSpeakingResumeRetry() {
        if (!this._speakingResumeHandler) return;
        document.removeEventListener(this._speakingResumeEvent, this._speakingResumeHandler);
        this._speakingResumeHandler = null;
    }

    // 指定IDのMediaStreamにAnalyserNodeを接続する。
    // id='local' は必ず「マイクの生トラック」を解析対象にする(画面共有中のミックス音声で
    // 自分が点灯しないようにするため — 仕様#7)。リモートは受信ストリームをそのまま使う。
    attachSpeakingAnalyser(id, stream) {
        const ctx = this.ensureSpeakingAudioContext();
        if (!ctx || !stream) return;
        const audioTrack = stream.getAudioTracks && stream.getAudioTracks()[0];
        if (!audioTrack) return;
        // 既存があれば作り直す(再入室・トラック差し替え対策)
        this.detachSpeakingAnalyser(id);
        try {
            // 単一トラックのStreamを渡す。localは画面共有ミックスではなく生マイクを保証。
            const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 512;          // 軽量。time domainの振幅計測には十分
            analyser.smoothingTimeConstant = 0.3;
            source.connect(analyser);
            // 注意: analyserをdestinationに繋がない(音は既にvideo要素から再生されており、
            // 繋ぐと二重再生やエコーの原因になる。解析はdestination未接続でも動作する)
            this.speakingAnalysers.set(id, {
                analyser,
                source,
                data: new Uint8Array(analyser.fftSize),
                speaking: false,
                quietSince: 0,
            });
        } catch (e) {
            // 一部ブラウザで既に解析中トラック等の理由で失敗しても通話は継続する
        }
        this.startSpeakingLoop();
    }

    detachSpeakingAnalyser(id) {
        const entry = this.speakingAnalysers.get(id);
        if (!entry) return;
        try { entry.source.disconnect(); } catch {}
        try { entry.analyser.disconnect(); } catch {}
        this.speakingAnalysers.delete(id);
        this.setSpeakingIndicator(id, false);
    }

    startSpeakingLoop() {
        if (this.speakingLoopTimer != null) return;
        this.speakingLoopTimer = setInterval(() => this.updateSpeakingStates(), ComChat.SPEAK_INTERVAL_MS);
    }

    stopSpeakingLoop() {
        if (this.speakingLoopTimer != null) {
            clearInterval(this.speakingLoopTimer);
            this.speakingLoopTimer = null;
        }
    }

    // ミュート中は点灯させない。自分は音声トラックのenabled/isAudioMuted、
    // リモートはmuteStates(相手が同期してくるミュート状態)で判定する。
    isParticipantMuted(id) {
        if (id === 'local') {
            const track = this.localStream && this.localStream.getAudioTracks()[0];
            // トラックがdisabledなら実際に音は出ていない。isAudioMutedも併用。
            if (track && !track.enabled) return true;
            return !!this.isAudioMuted;
        }
        return !!this.muteStates.get(id);
    }

    // 全員分を1本のループで計測。しきい値+ヒステリシス+消灯ホールドで判定し、
    // 状態が変化したタイル(DOM)だけを更新する(ループ内の無駄なDOM操作を避ける)。
    updateSpeakingStates() {
        const now = (typeof performance !== 'undefined' && performance.now)
            ? performance.now() : Date.now();
        this.speakingAnalysers.forEach((entry, id) => {
            const muted = this.isParticipantMuted(id);
            let rms = 0;
            if (!muted) {
                const buf = entry.data;
                entry.analyser.getByteTimeDomainData(buf);
                let sumSq = 0;
                for (let i = 0; i < buf.length; i++) {
                    const v = (buf[i] - 128) / 128; // -1..1 に正規化
                    sumSq += v * v;
                }
                rms = Math.sqrt(sumSq / buf.length);
            }

            if (entry.speaking) {
                // 点灯中: OFFしきい値を下回る無音がHOLD_MS続いたら消灯(ちらつき防止)
                if (muted || rms < ComChat.SPEAK_OFF_RMS) {
                    if (entry.quietSince === 0) entry.quietSince = now;
                    else if (now - entry.quietSince >= ComChat.SPEAK_HOLD_MS) {
                        entry.speaking = false;
                        entry.quietSince = 0;
                        this.setSpeakingIndicator(id, false);
                    }
                } else {
                    entry.quietSince = 0; // 十分な音量が戻ったので消灯タイマーをリセット
                }
            } else {
                // 消灯中: ONしきい値を超えたら即時点灯
                if (!muted && rms >= ComChat.SPEAK_ON_RMS) {
                    entry.speaking = true;
                    entry.quietSince = 0;
                    this.setSpeakingIndicator(id, true);
                }
            }
        });
    }

    // タイルへの.speakingクラス付与。DOM操作は状態変化時のみここで行う。
    setSpeakingIndicator(id, speaking) {
        const tile = document.getElementById(`video-${id}`);
        if (tile) tile.classList.toggle('speaking', speaking);
    }

    teardownSpeakingDetection() {
        this.stopSpeakingLoop();
        this.unregisterSpeakingResumeRetry();
        this.speakingAnalysers.forEach((entry, id) => {
            try { entry.source.disconnect(); } catch {}
            try { entry.analyser.disconnect(); } catch {}
            this.setSpeakingIndicator(id, false);
        });
        this.speakingAnalysers.clear();
        if (this.speakingAudioContext) {
            try { this.speakingAudioContext.close(); } catch {}
            this.speakingAudioContext = null;
        }
    }

    getCSSFilter(type) {
        const map = { blur: 'blur(10px)' };
        return map[type] || 'none';
    }

    initBgImagePanel() {
        this.bgImagePanel = document.getElementById('bg-image-panel');
        this.bgImagePanel.addEventListener('click', (e) => e.stopPropagation());

        this.bgImagePanel.querySelectorAll('.bg-preset').forEach((el) => {
            const name = el.dataset.preset;
            this.drawPresetThumbnail(el.querySelector('canvas'), name);
            el.addEventListener('click', async () => {
                this.clearBgPanelActive();
                el.classList.add('active');
                const newBitmap = await this.generatePresetBitmap(name);
                if (this.bgImage && !Object.values(this.bgPresets).includes(this.bgImage)) {
                    this.bgImage.close();
                }
                this.bgImage = newBitmap;
                this.bgImagePanel.classList.add('hidden');
                this.applyBgFilter('image');
            });
        });

        const uploadBtn = document.getElementById('bg-upload-btn');
        const uploadInput = document.getElementById('bg-upload-input');
        uploadBtn.addEventListener('click', (e) => { e.stopPropagation(); uploadInput.click(); });
        uploadInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            e.target.value = '';
            try {
                const dataURL = await this.resizeImageToDataURL(file);
                this.addToHistory(dataURL);
                this.renderHistoryThumbnails();
                // Mark the newly added item (index 0) as active
                document.querySelector('#bg-history-grid .bg-history-item')?.classList.add('active');
                const newBitmap = await this.loadBgFromDataURL(dataURL);
                if (this.bgImage && !Object.values(this.bgPresets).includes(this.bgImage)) {
                    this.bgImage.close();
                }
                this.bgImage = newBitmap;
                this.bgImagePanel.classList.add('hidden');
                this.applyBgFilter('image');
            } catch (err) {
                console.warn('Failed to load background image:', err);
            }
        });

        // Load history from localStorage (with migration from old single-key format)
        this.loadBgHistory();
        this.renderHistoryThumbnails();
        // Pre-load the most recent upload as bgImage for quick reuse
        if (this.bgHistory.length > 0) {
            this.loadBgFromDataURL(this.bgHistory[0]).then(bm => { this.bgImage = bm; }).catch(() => {});
        }
    }

    loadBgHistory() {
        try {
            const saved = localStorage.getItem('comchat_bg_history');
            if (saved) {
                const parsed = JSON.parse(saved);
                this.bgHistory = Array.isArray(parsed) ? parsed.slice(0, 3) : [];
                return;
            }
        } catch {}
        // Migrate from old single-image key
        try {
            const old = localStorage.getItem('comchat_bg_image');
            if (old) {
                this.bgHistory = [old];
                try {
                    localStorage.setItem('comchat_bg_history', JSON.stringify(this.bgHistory));
                    localStorage.removeItem('comchat_bg_image');
                } catch {}
            }
        } catch {}
    }

    addToHistory(dataURL) {
        this.bgHistory = this.bgHistory.filter(d => d !== dataURL);
        this.bgHistory.unshift(dataURL);
        this.bgHistory = this.bgHistory.slice(0, 3);
        try { localStorage.setItem('comchat_bg_history', JSON.stringify(this.bgHistory)); } catch {}
    }

    renderHistoryThumbnails() {
        const section = document.getElementById('bg-history-section');
        const grid = document.getElementById('bg-history-grid');
        if (!section || !grid) return;

        grid.innerHTML = '';

        if (this.bgHistory.length === 0) {
            section.classList.add('hidden');
            return;
        }
        section.classList.remove('hidden');

        this.bgHistory.forEach((dataURL, index) => {
            const item = document.createElement('div');
            item.className = 'bg-history-item';

            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 36;

            const label = document.createElement('span');
            label.textContent = `履歴${index + 1}`;

            item.appendChild(canvas);
            item.appendChild(label);
            grid.appendChild(item);

            // Draw thumbnail (cover crop, same as preset)
            const img = new Image();
            img.onload = () => {
                const ctx = canvas.getContext('2d');
                const w = 64, h = 36;
                const r = img.naturalWidth / img.naturalHeight;
                const tr = w / h;
                let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
                if (r > tr) { sw = sh * tr; sx = (img.naturalWidth - sw) / 2; }
                else        { sh = sw / tr; sy = (img.naturalHeight - sh) / 2; }
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
            };
            img.src = dataURL;

            item.addEventListener('click', async () => {
                this.clearBgPanelActive();
                item.classList.add('active');
                const newBitmap = await this.loadBgFromDataURL(dataURL);
                if (this.bgImage && !Object.values(this.bgPresets).includes(this.bgImage)) {
                    this.bgImage.close();
                }
                this.bgImage = newBitmap;
                this.bgImagePanel.classList.add('hidden');
                this.applyBgFilter('image');
            });
        });
    }

    clearBgPanelActive() {
        this.bgImagePanel.querySelectorAll('.bg-preset').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.bg-history-item').forEach(i => i.classList.remove('active'));
    }

    showBgImagePanel() {
        // 通話中の位置基準は#more-btn(常時表示)。#bg-filterは「その他」メニュー内の行で、
        // メニューが閉じた後は非表示(rectが全て0)になるため位置基準に使えない
        const refBtn = (this.precallDialog && !this.precallDialog.classList.contains('hidden'))
            ? this.precallFilterBtn : this.moreBtn;
        const rect = refBtn.getBoundingClientRect();
        this.bgImagePanel.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
        this.bgImagePanel.style.left = (rect.left + rect.width / 2) + 'px';
        this.bgImagePanel.classList.remove('hidden');
        // #more-btnは画面右端のため、小画面では中央揃えパネルが右にはみ出す→画面内へ寄せる
        this.clampPanelToViewport(this.bgImagePanel, rect);
    }

    _presetUrl(name) {
        const map = {
            'white-accent': 'images/bg-room.jpg',
            'blue-gradient': 'images/bg-flowers.jpg',
            'green-nature':  'images/bg-resort.jpg',
        };
        return map[name] || '';
    }

    drawPresetThumbnail(canvas, name) {
        const img = new Image();
        img.onload = () => {
            const ctx = canvas.getContext('2d');
            const w = canvas.width, h = canvas.height;
            const r = img.naturalWidth / img.naturalHeight;
            const tr = w / h;
            let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
            if (r > tr) { sw = sh * tr; sx = (img.naturalWidth - sw) / 2; }
            else        { sh = sw / tr; sy = (img.naturalHeight - sh) / 2; }
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
        };
        img.src = this._presetUrl(name);
    }

    async generatePresetBitmap(name) {
        if (this.bgPresets[name]) return this.bgPresets[name];
        const bitmap = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => createImageBitmap(img).then(resolve).catch(reject);
            img.onerror = reject;
            img.src = this._presetUrl(name);
        });
        this.bgPresets[name] = bitmap;
        return bitmap;
    }

    resizeImageToDataURL(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                const maxW = 1280, maxH = 720;
                let w = img.naturalWidth, h = img.naturalHeight;
                if (w > maxW || h > maxH) {
                    const ratio = Math.min(maxW / w, maxH / h);
                    w = Math.round(w * ratio);
                    h = Math.round(h * ratio);
                }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.onerror = (err) => { URL.revokeObjectURL(url); reject(err); };
            img.src = url;
        });
    }

    loadBgFromDataURL(dataURL) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => createImageBitmap(img).then(resolve).catch(reject);
            img.onerror = reject;
            img.src = dataURL;
        });
    }

    async loadMediaPipe() {
        if (window._mpTasks) return;
        window._mpTasks = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
    }

    async initSelfieSegmentation() {
        if (this.imageSegmenter) return;
        await this.loadMediaPipe();
        const { FilesetResolver, ImageSegmenter } = window._mpTasks;
        if (!window._mpVision) {
            window._mpVision = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
            );
        }
        const modelAssetPath = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite';
        const segOpts = { runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true };
        try {
            this.imageSegmenter = await ImageSegmenter.createFromOptions(window._mpVision, {
                ...segOpts, baseOptions: { modelAssetPath, delegate: 'GPU' },
            });
        } catch {
            // GPU delegate fails in Safari due to WebGL incompatibility — fall back to CPU
            this.imageSegmenter = await ImageSegmenter.createFromOptions(window._mpVision, {
                ...segOpts, baseOptions: { modelAssetPath, delegate: 'CPU' },
            });
        }
    }

    onSegmentationResults(result, sourceImage) {
        // カメラオフ中は常に黒を描く。stopBgFilterLoop後に遅れて着弾した非同期結果が
        // toggleVideoの黒塗りを上書きして直前フレームが固着するレースを防ぐ(実機SE3で再現)。
        const camTrack = this.localStream && this.localStream.getVideoTracks()[0];
        if (camTrack && !camTrack.enabled) {
            if (this.bgFilterCtx && this.bgFilterCanvas) {
                this.bgFilterCtx.fillStyle = '#000';
                this.bgFilterCtx.fillRect(0, 0, this.bgFilterCanvas.width, this.bgFilterCanvas.height);
            }
            result.close?.(); // resultはこの関数内で解放する契約(下の'none'パスと同じ)
            return;
        }
        if (this.bgFilterType === 'none' || !this.bgFilterCtx) { result.close?.(); return; }
        const ctx = this.bgFilterCtx;
        const w = this.bgFilterCanvas.width;
        const h = this.bgFilterCanvas.height;
        // selfie_segmenter_landscape: confidenceMasks[0] = person confidence (high = person, no inversion needed)
        const confidence = result.confidenceMasks?.[0];
        if (!confidence || !this.maskImageData || !this.blurCtx || !this.personCtx || !this.maskSmallCtx) { result.close?.(); return; }
        const maskData = confidence.getAsUint8Array();
        if (!this.prevConfidenceData || this.prevConfidenceData.length !== maskData.length) {
            this.prevConfidenceData = new Float32Array(maskData);
        }
        let personCount = 0;
        for (let i = 0; i < maskData.length; i++) {
            if (maskData[i] > 128) personCount++;
            const diff = Math.abs(maskData[i] - this.prevConfidenceData[i]);
            const alpha = diff > 80 ? 0.5 : 0.15;
            this.prevConfidenceData[i] = alpha * maskData[i] + (1 - alpha) * this.prevConfidenceData[i];
            this.maskImageData.data[i * 4 + 3] = this.sigmoidLUT[this.prevConfidenceData[i] | 0];
        }
        this.maskCtx.putImageData(this.maskImageData, 0, 0);
        result.close?.();

        // 破綻検知: 「人物がほぼ0%」かつ「起動後一度も正常分離せず」が継続したら自動オフ
        this.checkSegmentationHealth(personCount / maskData.length);

        // Scale-down/up smoothing softens jagged mask boundaries
        const mw = this.maskSmallCanvas.width, mh = this.maskSmallCanvas.height;
        this.maskSmallCtx.imageSmoothingEnabled = true;
        this.maskSmallCtx.imageSmoothingQuality = 'high';
        this.maskSmallCtx.clearRect(0, 0, mw, mh);
        this.maskSmallCtx.drawImage(this.maskCanvas, 0, 0, mw, mh);
        this.maskCtx.imageSmoothingEnabled = true;
        this.maskCtx.imageSmoothingQuality = 'high';
        this.maskCtx.clearRect(0, 0, w, h);
        if (this._useCtxFilterBlur) {
            // blur(6px) during upscale → natural feathered edge at person boundary
            this.maskCtx.filter = 'blur(6px)';
            this.maskCtx.drawImage(this.maskSmallCanvas, 0, 0, w, h);
            this.maskCtx.filter = 'none';
        } else {
            // Two-pass scale for wider edge softening in Safari fallback
            this.maskCtx.drawImage(this.maskSmallCanvas, 0, 0, w, h);
            this.maskSmallCtx.clearRect(0, 0, mw, mh);
            this.maskSmallCtx.drawImage(this.maskCanvas, 0, 0, mw, mh);
            this.maskCtx.clearRect(0, 0, w, h);
            this.maskCtx.drawImage(this.maskSmallCanvas, 0, 0, w, h);
        }

        // Step 1: pre-render background effect to blurCanvas
        if (this.bgFilterType === 'blur') {
            if (this._useCtxFilterBlur) {
                // Zoom相当の穏やかなぼかし。固定pxだと解像度で見えが変わるため高さに比例させる
                // (480p→14px・720p→22px)。はみ出し描画マージンは半径+10pxで縁の暗化を防ぐには十分
                const blurPx = Math.max(10, Math.round(h * 0.03));
                const b = blurPx + 10;
                this.blurCtx.filter = `blur(${blurPx}px)`;
                this.blurCtx.drawImage(sourceImage, -b, -b, w + 2 * b, h + 2 * b);
                this.blurCtx.filter = 'none';
            } else {
                // Safari fallback: 7-pass 1/2-scale down/up (stronger blur)
                const sw = this.smallCanvas.width, sh = this.smallCanvas.height;
                this.blurCtx.imageSmoothingEnabled = true;
                this.blurCtx.imageSmoothingQuality = 'high';
                this.smallCtx.imageSmoothingEnabled = true;
                this.smallCtx.imageSmoothingQuality = 'high';
                this.smallCtx.drawImage(sourceImage, 0, 0, sw, sh);
                this.blurCtx.drawImage(this.smallCanvas, 0, 0, w, h);
                this.smallCtx.drawImage(this.blurCanvas, 0, 0, sw, sh);
                this.blurCtx.drawImage(this.smallCanvas, 0, 0, w, h);
                this.smallCtx.drawImage(this.blurCanvas, 0, 0, sw, sh);
                this.blurCtx.drawImage(this.smallCanvas, 0, 0, w, h);
                this.smallCtx.drawImage(this.blurCanvas, 0, 0, sw, sh);
                this.blurCtx.drawImage(this.smallCanvas, 0, 0, w, h);
                this.smallCtx.drawImage(this.blurCanvas, 0, 0, sw, sh);
                this.blurCtx.drawImage(this.smallCanvas, 0, 0, w, h);
                this.smallCtx.drawImage(this.blurCanvas, 0, 0, sw, sh);
                this.blurCtx.drawImage(this.smallCanvas, 0, 0, w, h);
                this.smallCtx.drawImage(this.blurCanvas, 0, 0, sw, sh);
                this.blurCtx.drawImage(this.smallCanvas, 0, 0, w, h);
            }
        } else if (this.bgFilterType === 'image' && this.bgImage) {
            this.blurCtx.drawImage(this.bgImage, 0, 0, w, h);
        } else {
            this.blurCtx.filter = this.getCSSFilter(this.bgFilterType);
            this.blurCtx.drawImage(sourceImage, 0, 0, w, h);
            this.blurCtx.filter = 'none';
        }

        // Step 2: extract sharp person pixels into personCanvas
        this.personCtx.globalCompositeOperation = 'copy';
        this.personCtx.drawImage(this.maskCanvas, 0, 0, w, h);
        this.personCtx.globalCompositeOperation = 'source-in';
        this.personCtx.drawImage(sourceImage, 0, 0, w, h);
        this.personCtx.globalCompositeOperation = 'source-over';

        // Step 3: composite — blurred background then sharp person on top
        ctx.globalCompositeOperation = 'copy';
        ctx.drawImage(this.blurCanvas, 0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(this.personCanvas, 0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
    }

    // 破綻検知のパラメータ
    static get SEG_WARMUP_MS() { return 600; }     // 起動直後の不安定フレームを無視
    static get SEG_SUSTAIN_MS() { return 2500; }   // この時間連続で破綻したら自動オフ
    static get SEG_DEGEN_RATIO() { return 0.005; } // 人物がこの割合未満なら「ほぼ0%」
    static get SEG_HEALTHY_RATIO() { return 0.08; }// 一度でもこの割合に達したら正常実績あり

    // セグメンテーションが破綻していないか毎フレーム監視する。
    // 「人物 ≈ 0%」かつ「起動後に一度も正常分離していない」がウォームアップ後に
    // 一定時間続いたら、フィルターを自動的にオフにする(Air2等の対策)。
    // 会議途中の席外しは離席前に healthySeen=true になるため発動しない。
    checkSegmentationHealth(personRatio) {
        const now = performance.now();
        if (this._segFilterStartT == null) this._segFilterStartT = now;
        // 起動直後(モデル初期化中)はまだ判定しない
        if (now - this._segFilterStartT < ComChat.SEG_WARMUP_MS) return;
        if (personRatio >= ComChat.SEG_HEALTHY_RATIO) this._segHealthySeen = true;
        const degenerate = personRatio < ComChat.SEG_DEGEN_RATIO && !this._segHealthySeen;
        if (degenerate) {
            if (this._segDegenStart == null) {
                this._segDegenStart = now;
            } else if (now - this._segDegenStart >= ComChat.SEG_SUSTAIN_MS) {
                this.handleBgFilterBreakage();
            }
        } else {
            this._segDegenStart = null;
        }
    }

    // 破綻が確定したときの処理。1回目は柔らかく案内して再挑戦可、2回目は確定無効化。
    handleBgFilterBreakage() {
        this._segDegenStart = null;
        this._bgFilterAutoDisableCount++;
        const second = this._bgFilterAutoDisableCount >= 2;
        if (second) this._bgFilterRuntimeBlocked = true;
        const msg = second
            ? 'この端末では背景フィルターを利用できません。'
            : '背景フィルターがうまく動作していないようです。オフにしました。';
        this.applyBgFilter('none'); // フィルター停止＋生カメラに復帰
        const inPrecall = this.precallDialog && !this.precallDialog.classList.contains('hidden');
        if (inPrecall) {
            this.showPrecallStatus(msg);
        } else {
            this.showStatus(msg, 'error');
        }
    }

    startBgFilterLoop() {
        // 世代トークンを進める＝以前のループを無効化(再入ガードも兼ねる)。
        // await grabFrame()中に停止要求が来てもgenの食い違いでループが自然死し、
        // カメラON/OFFの都度ループが増殖する問題を根治する。
        const gen = ++this._bgFilterLoopGen;
        const loop = async () => {
            if (this._bgFilterLoopGen !== gen || this.bgFilterType === 'none') return;
            try {
                if (this.imageCapture) {
                    const bitmap = await this.imageCapture.grabFrame();
                    if (this.imageSegmenter && this.bgFilterType !== 'none') {
                        const result = this.imageSegmenter.segmentForVideo(bitmap, performance.now());
                        this.onSegmentationResults(result, bitmap);
                    }
                    bitmap.close();
                } else if (this.bgSourceVideo?.readyState >= 2 && this.imageSegmenter) {
                    const bitmap = await createImageBitmap(this.bgSourceVideo);
                    const result = this.imageSegmenter.segmentForVideo(bitmap, performance.now());
                    this.onSegmentationResults(result, bitmap);
                    bitmap.close();
                }
            } catch (e) {}
            if (this._bgFilterLoopGen !== gen || this.bgFilterType === 'none') return;
            this.bgFilterAnimId = requestAnimationFrame(loop);
        };
        this.bgFilterAnimId = requestAnimationFrame(loop);
    }

    startCSSFilterLoop() {
        const draw = () => {
            if (this.bgFilterType === 'none' || !this.bgFilterCtx) return;
            // カメラオフ中は常に黒を描き、当該フレームの描画はスキップする
            // (iOS Safari等でdisabledトラックの映像フレームが固着するのを防ぐ)
            const camTrack = this.localStream && this.localStream.getVideoTracks()[0];
            if (camTrack && !camTrack.enabled) {
                this.bgFilterCtx.fillStyle = '#000';
                this.bgFilterCtx.fillRect(0, 0, this.bgFilterCanvas.width, this.bgFilterCanvas.height);
                this.bgFilterAnimId = requestAnimationFrame(draw);
                return;
            }
            if (this.imageCapture) {
                // ImageCapture: grab frame asynchronously, draw when ready
                this.imageCapture.grabFrame().then(bitmap => {
                    if (this.bgFilterType === 'none' || !this.bgFilterCtx) { bitmap.close(); return; }
                    const vw = bitmap.width;
                    const vh = bitmap.height;
                    if (vw > 0 && this.bgFilterCanvas.width !== vw) {
                        this.bgFilterCanvas.width = vw;
                        this.bgFilterCanvas.height = vh;
                    }
                    this.bgFilterCtx.filter = this.getCSSFilter(this.bgFilterType);
                    this.bgFilterCtx.drawImage(bitmap, 0, 0, this.bgFilterCanvas.width, this.bgFilterCanvas.height);
                    this.bgFilterCtx.filter = 'none';
                    bitmap.close();
                }).catch(() => {});
            } else if (this.bgSourceVideo?.readyState >= 2) {
                const vw = this.bgSourceVideo.videoWidth;
                const vh = this.bgSourceVideo.videoHeight;
                if (vw > 0 && this.bgFilterCanvas.width !== vw) {
                    this.bgFilterCanvas.width = vw;
                    this.bgFilterCanvas.height = vh;
                }
                this.bgFilterCtx.filter = this.getCSSFilter(this.bgFilterType);
                this.bgFilterCtx.drawImage(this.bgSourceVideo, 0, 0, this.bgFilterCanvas.width, this.bgFilterCanvas.height);
                this.bgFilterCtx.filter = 'none';
            }
            this.bgFilterAnimId = requestAnimationFrame(draw);
        };
        this.bgFilterAnimId = requestAnimationFrame(draw);
    }

    stopBgFilterLoop() {
        this._bgFilterLoopGen++; // 実行中ループを無効化(await復帰時にgen不一致で自然死させる)
        if (this.bgFilterAnimId != null) {
            cancelAnimationFrame(this.bgFilterAnimId);
            this.bgFilterAnimId = null;
        }
    }

    cleanupBgFilterResources() {
        if (this.bgSourceVideo && this.bgSourceIsOwned) {
            this.bgSourceVideo.srcObject = null;
            this.bgSourceVideo.remove();
        }
        this.bgSourceVideo = null;
        this.bgSourceIsOwned = false;
        this.imageCapture = null;
        if (this.imageSegmenter) {
            this.imageSegmenter.close();
            this.imageSegmenter = null;
        }
        this.maskCanvas = null;
        this.maskCtx = null;
        this.maskImageData = null;
        this.blurCanvas = null;
        this.blurCtx = null;
        this.personCanvas = null;
        this.personCtx = null;
        this.smallCanvas = null;
        this.smallCtx = null;
        this.maskSmallCanvas = null;
        this.maskSmallCtx = null;
        this.sigmoidLUT = null;
        this.prevConfidenceData = null;
        this.bgFilterCanvas = null;
        this.bgFilterCtx = null;
        if (this.bgFilterStream) {
            this.bgFilterStream.getTracks().forEach(t => t.stop());
        }
        this.bgFilterStream = null;
        // 破綻検知の計測状態をリセット(自動オフ回数/恒久ブロックはセッション維持なので残す)
        this._segFilterStartT = null;
        this._segDegenStart = null;
        this._segHealthySeen = false;
    }

    async applyBgFilter(type) {
        const wasActive = this.bgFilterType !== 'none';
        this.bgFilterType = type;

        this.filterPanel.querySelectorAll('.filter-option').forEach(el => {
            el.classList.toggle('active', el.dataset.filter === type);
        });

        const localVideoEl = document.querySelector('#video-local .video-element');

        if (type === 'none') {
            // 進行中の初回セットアップ(下のawait待機中)を無効化する。中間生成物は
            // 直後のcleanupBgFilterResourcesが回収し、stale側はgen不一致で静かに退く
            this._bgFilterGen = (this._bgFilterGen || 0) + 1;
            this.stopBgFilterLoop();
            this.cleanupBgFilterResources();
            if (localVideoEl) {
                localVideoEl.style.filter = '';
                if (this.localStream) {
                    localVideoEl.srcObject = this.localStream;
                    localVideoEl.play().catch(() => {});
                }
            }
            // Update pre-call preview
            if (this.precallDialog && !this.precallDialog.classList.contains('hidden')) {
                this.precallPreview.srcObject = this.localStream;
                this.precallPreview.play().catch(() => {});
            }
            if (!this.currentScreenStream) {
                const origTrack = this.localStream?.getVideoTracks()[0];
                if (origTrack) {
                    this.calls.forEach(call => {
                        const sender = call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
                        if (sender) sender.replaceTrack(origTrack).catch(() => {});
                    });
                }
            }
            this.syncFilterBtnState();
            return;
        }

        // 非対応端末では起動を中止(画像プリセット経由など、パネルのガードを通らない呼び出しの保険)
        if (!wasActive && !this.canUseBgFilter()) {
            this.bgFilterType = 'none';
            this.filterPanel.querySelectorAll('.filter-option').forEach(el =>
                el.classList.toggle('active', el.dataset.filter === 'none'));
            this.syncFilterBtnState();
            const inPrecall = this.precallDialog && !this.precallDialog.classList.contains('hidden');
            if (inPrecall) {
                this.showPrecallStatus('この端末では背景フィルターを使えません');
            } else {
                this.showStatus('この端末では背景フィルターを使えません', 'error');
            }
            return;
        }

        if (wasActive) {
            // CSS-only fallback: no canvas, update style.filter directly
            if (!this.bgFilterCanvas) {
                if (localVideoEl) localVideoEl.style.filter = this.getCSSFilter(type);
            }
            // Canvas loop reads bgFilterType dynamically — no other action needed.
            return;
        }

        // First activation
        // 世代トークン: セットアップは下のawait(grabFrame/loadeddata/モデルDL)で数秒待ちうる。
        // 待機中に「なし」→再設定が割り込むと2つのセットアップが並走し、rAFループ二重化・
        // captureStreamトラック孤立・null化されたbgSourceVideo参照が起こるため、
        // 各await後にgenを確認しstaleなら退く(genを進めるのはnoneパスとここだけ。
        // wasActive=trueの型変更はループが動的に追従するのでgenに触らない)
        this._bgFilterGen = (this._bgFilterGen || 0) + 1;
        const gen = this._bgFilterGen;
        this.syncFilterBtnState();

        try {
            const videoTrack = this.localStream?.getVideoTracks()[0];
            let srcW = 0, srcH = 0;

            // Strategy 1: ImageCapture API — reads frames directly from the video track,
            // bypassing DOM video element throttling entirely. Works on Safari 17.2+ and Chrome 59+.
            if (videoTrack && typeof ImageCapture !== 'undefined') {
                try {
                    const ic = new ImageCapture(videoTrack);
                    const probe = await ic.grabFrame();
                    srcW = probe.width;
                    srcH = probe.height;
                    probe.close();
                    if (gen !== this._bgFilterGen) return; // 待機中に割り込みあり: 後続呼び出しに任せて退く
                    this.imageCapture = ic;
                } catch (icErr) {
                    console.warn('ImageCapture unavailable:', icErr);
                    this.imageCapture = null;
                }
            }

            // Strategy 2: Hidden bgSourceVideo fallback (for browsers without ImageCapture)
            if (!this.imageCapture) {
                this.bgSourceVideo = document.createElement('video');
                // Off-screen at reasonable size — Safari throttles/misrenders tiny video elements
                this.bgSourceVideo.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:240px;pointer-events:none;';
                this.bgSourceVideo.muted = true;
                this.bgSourceVideo.autoplay = true;
                this.bgSourceVideo.playsInline = true;
                this.bgSourceVideo.srcObject = this.localStream;
                this.bgSourceIsOwned = true;
                document.body.appendChild(this.bgSourceVideo);
                await this.bgSourceVideo.play().catch(() => {});
                if (this.bgSourceVideo.readyState < 2) {
                    await new Promise(r => {
                        this.bgSourceVideo.addEventListener('loadeddata', r, { once: true });
                        setTimeout(r, 5000);
                    });
                }
                // 待機中に'none'が割り込むとcleanupBgFilterResourcesがbgSourceVideoを
                // 除去・null化しているため、参照前に必ずgenを確認する
                if (gen !== this._bgFilterGen) return;
                srcW = this.bgSourceVideo.videoWidth;
                srcH = this.bgSourceVideo.videoHeight;
            }

            if (!srcW || !srcH) throw new Error('could not determine video dimensions');

            // Canvas setup + ctx.filter support check (unsupported on Safari < 18)
            this.bgFilterCanvas = document.createElement('canvas');
            this.bgFilterCanvas.width = srcW;
            this.bgFilterCanvas.height = srcH;
            this.bgFilterCtx = this.bgFilterCanvas.getContext('2d');

            this.bgFilterStream = this.bgFilterCanvas.captureStream(30);
            if (!this.bgFilterStream.getVideoTracks().length) throw new Error('captureStream no tracks');

            // Try MediaPipe for background segmentation (person stays sharp)
            let usedMediaPipe = false;
            try {
                this.showStatus('背景フィルターを読み込み中...', 'connecting');
                await this.initSelfieSegmentation();
                // 待機中に'none'や再設定が割り込んだら退く('none'パスが必ずgenを進めるため、
                // gen一致ならbgFilterTypeも'none'ではないことが保証される)。
                // ここでは何も片付けない: 進行中フィールドは'none'側のcleanupが回収済みで、
                // 下手に触ると後続呼び出しの生成物を壊す。segmenterが残っても次回
                // initSelfieSegmentationが再利用するか、hangup時のcleanupで閉じられる。
                if (gen !== this._bgFilterGen) return;
                // Pre-allocate compositing canvases (avoids per-frame allocation)
                this.maskCanvas = document.createElement('canvas');
                this.maskCanvas.width = srcW;
                this.maskCanvas.height = srcH;
                this.maskCtx = this.maskCanvas.getContext('2d');
                this.maskImageData = this.maskCtx.createImageData(srcW, srcH);
                for (let i = 0; i < this.maskImageData.data.length; i += 4) {
                    this.maskImageData.data[i] = 255;
                    this.maskImageData.data[i + 1] = 255;
                    this.maskImageData.data[i + 2] = 255;
                }
                this.blurCanvas = document.createElement('canvas');
                this.blurCanvas.width = srcW;
                this.blurCanvas.height = srcH;
                this.blurCtx = this.blurCanvas.getContext('2d');
                this.personCanvas = document.createElement('canvas');
                this.personCanvas.width = srcW;
                this.personCanvas.height = srcH;
                this.personCtx = this.personCanvas.getContext('2d');
                // 1/2 scale — 2×2 block size vs old 1/4 (4×4), gives smoother Gaussian approximation
                this.smallCanvas = document.createElement('canvas');
                this.smallCanvas.width = Math.max(1, Math.floor(srcW / 2));
                this.smallCanvas.height = Math.max(1, Math.floor(srcH / 2));
                this.smallCtx = this.smallCanvas.getContext('2d');
                // 1/4 scale (vs old 1/16) preserves more edge detail while still smoothing model artifacts
                this.maskSmallCanvas = document.createElement('canvas');
                this.maskSmallCanvas.width = Math.max(1, Math.floor(srcW / 4));
                this.maskSmallCanvas.height = Math.max(1, Math.floor(srcH / 4));
                this.maskSmallCtx = this.maskSmallCanvas.getContext('2d');
                // Sigmoid LUT: center at 150 (vs 128) to raise person-confidence threshold,
                // reducing misclassification of nearby objects (e.g. sticks, furniture)
                this.sigmoidLUT = new Uint8Array(256);
                for (let j = 0; j < 256; j++) {
                    this.sigmoidLUT[j] = Math.round(255 / (1 + Math.exp(-0.09 * (j - 150))));
                }
                // Pixel test for ctx.filter support — property-value checks fail in Safari < 18
                // because the property accepts writes but silently ignores them.
                // Drawing a blurred shape and checking pixel spread is the only reliable method.
                const bTestCanvas = document.createElement('canvas');
                bTestCanvas.width = bTestCanvas.height = 8;
                const bTestCtx = bTestCanvas.getContext('2d');
                bTestCtx.filter = 'blur(2px)';
                bTestCtx.fillStyle = '#fff';
                bTestCtx.fillRect(3, 3, 2, 2);
                this._useCtxFilterBlur = bTestCtx.getImageData(0, 0, 1, 1).data[3] > 0;
                this.startBgFilterLoop();
                usedMediaPipe = true;
            } catch (mpErr) {
                console.warn('MediaPipe unavailable, falling back to CSS filter:', mpErr);
                if (this.imageSegmenter) { this.imageSegmenter.close(); this.imageSegmenter = null; }
                this.startCSSFilterLoop();
            }

            // Switch local preview to canvas output (shows same result as remote peers)
            if (localVideoEl) {
                localVideoEl.srcObject = this.bgFilterStream;
                localVideoEl.style.filter = '';
                localVideoEl.play().catch(() => {});
            }
            // Update pre-call preview
            if (this.precallDialog && !this.precallDialog.classList.contains('hidden')) {
                this.precallPreview.srcObject = this.bgFilterStream;
                this.precallPreview.play().catch(() => {});
            }

            // Send canvas track to remote peers
            if (!this.currentScreenStream) {
                const canvasTrack = this.bgFilterStream.getVideoTracks()[0];
                this.calls.forEach(call => {
                    const sender = call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
                    if (sender && canvasTrack) sender.replaceTrack(canvasTrack).catch(() => {});
                });
            }

            this.showStatus(usedMediaPipe ? '背景フィルターを適用しました' : 'フィルターを適用しました', 'connected');

        } catch (err) {
            // 割り込み後の残骸例外(null化されたリソース参照等)では後続呼び出しの
            // 生成物を壊さないよう、staleなら何もせず退く
            if (gen !== this._bgFilterGen) return;
            console.warn('Filter setup failed, using CSS-only mode:', err);
            this.stopBgFilterLoop();
            this.cleanupBgFilterResources();
            if (type === 'image') {
                this.bgFilterType = 'none';
                this.syncFilterBtnState();
                this.filterPanel.querySelectorAll('.filter-option').forEach(el => {
                    el.classList.toggle('active', el.dataset.filter === 'none');
                });
                this.showStatus('背景画像の設定に失敗しました', 'error');
            } else {
                if (localVideoEl) localVideoEl.style.filter = this.getCSSFilter(type);
                this.showStatus('フィルターを適用しました（自分の画面のみ）', 'connected');
            }
        }
    }

    syncFilterBtnState() {
        const isActive = this.bgFilterType !== 'none';
        this.bgFilterBtn.classList.toggle('active', isActive);
        if (this.precallFilterBtn) this.precallFilterBtn.classList.toggle('active', isActive);
    }

    // 背景フィルター(人物セグメンテーション)が実用的に動く端末か判定する。
    // 非対応GPU(WebGL2非対応 / ソフトウェアレンダラ / HD Graphics 3000等の旧Intel GPU)では
    // ・CPUフォールバックが同期処理でメインスレッドを固める(例: 2011 MacBook Air)
    // ・マスクが破綻して人物が消える(例: iPad 2)
    // ため、機能自体を無効化する。結果はメモ化(canvas生成を毎回避ける)。
    canUseBgFilter() {
        // 実行時に2回破綻を検知した端末はそのセッション無効で確定(再オンを防ぐ)
        if (this._bgFilterRuntimeBlocked) return false;
        if (this._bgFilterSupported !== undefined) return this._bgFilterSupported;
        this._bgFilterSupported = false;
        try {
            const c = document.createElement('canvas');
            const gl = c.getContext('webgl2');
            if (!gl) return false; // WebGL2非対応（iPad2/iOS9等）
            const dbg = gl.getExtension('WEBGL_debug_renderer_info');
            if (dbg) {
                const renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
                const weak = /swiftshader|software|llvmpipe|basic render|hd graphics (2000|3000)|gma\b|x3100|945|965/i.test(renderer);
                if (weak) return false;
            }
            // デバッグ情報非公開の場合（Safariプライバシー保護等）はテクスチャサイズで判定
            // 2048以下は旧世代GPU
            const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
            if (maxTex < 2048) return false;
            this._bgFilterSupported = true;
        } catch {
            this._bgFilterSupported = false;
        }
        return this._bgFilterSupported;
    }

    // プリコールダイアログ内にステータスメッセージを表示（3秒後に自動消去）
    showPrecallStatus(msg) {
        const el = document.getElementById('precall-status-msg');
        if (!el) return;
        el.textContent = msg;
        el.classList.remove('hidden');
        clearTimeout(this._precallStatusTimer);
        this._precallStatusTimer = setTimeout(() => el.classList.add('hidden'), 3000);
    }

    async showPreCallDialog(action) {
        if (this.isConnecting || this.localStream) return;
        // iOSでソフトキーボードが開いたまま(ルームID入力直後)fixedのダイアログを出すと、
        // 描画位置とタップ判定がずれ、ボタンを押したつもりが背景(バックドロップ)判定に
        // なって即キャンセルされたり、以後のタップが全く効かなくなる。先にキーボードを
        // 閉じてスクロールを先頭へ戻してから開く(showCallScreenと同じ対策)。
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        window.scrollTo(0, 0);
        this.isConnecting = true;
        this.createRoomBtn.disabled = true;
        this.joinRoomBtn.disabled = true;
        this.confirmJoinBtn.disabled = true;

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch (err) {
            this.showStatus(this.describeMediaError(err), 'error');
            this.isConnecting = false;
            this.createRoomBtn.disabled = false;
            this.joinRoomBtn.disabled = false;
            this.confirmJoinBtn.disabled = false;
            return;
        }
        this.isConnecting = false;

        this.precallAction = action;
        this.precallConfirmBtn.textContent = action === 'create' ? '作成する' : '参加する';

        // Reset button states
        this.isAudioMuted = false;
        this.precallVideoBtn.classList.remove('off');
        this.precallAudioBtn.classList.remove('off');
        this.precallFilterBtn.classList.remove('active');
        this.filterPanel.querySelectorAll('.filter-option').forEach(el => {
            el.classList.toggle('active', el.dataset.filter === 'none');
        });

        // Show preview (hidden initially until video loads)
        this.precallPreview.srcObject = this.localStream;
        this.precallPreview.play().catch(() => {});
        this._noCameraTimeout = setTimeout(() => {
            if (!this.precallNoCamera.classList.contains('hidden')) {
                this.precallNoCamera.querySelector('span').textContent = 'カメラを起動できませんでした';
            }
        }, 5000);
        // Keep a reference so a cancel/confirm before 'loadeddata' fires can detach
        // the once-listener (otherwise it accumulates across open/cancel cycles).
        this._precallLoadedHandler = () => {
            clearTimeout(this._noCameraTimeout);
            this._noCameraTimeout = null;
            this._precallLoadedHandler = null;
            const videoTrack = this.localStream?.getVideoTracks()[0];
            if (!videoTrack || videoTrack.enabled) {
                this.precallNoCamera.classList.add('hidden');
            }
        };
        this.precallPreview.addEventListener('loadeddata', this._precallLoadedHandler, { once: true });

        this.precallDialog.classList.remove('hidden');
    }

    cancelPreCall() {
        if (this._noCameraTimeout) { clearTimeout(this._noCameraTimeout); this._noCameraTimeout = null; }
        if (this._precallLoadedHandler) {
            this.precallPreview.removeEventListener('loadeddata', this._precallLoadedHandler);
            this._precallLoadedHandler = null;
        }
        this.precallDialog.classList.add('hidden');
        this.filterPanel.classList.add('hidden');
        if (this.bgImagePanel) this.bgImagePanel.classList.add('hidden');

        // Clean up bg filter
        this.stopBgFilterLoop();
        this.cleanupBgFilterResources();
        this.bgFilterType = 'none';
        if (this.bgImage && !Object.values(this.bgPresets).includes(this.bgImage)) {
            this.bgImage.close();
        }
        this.bgImage = null;
        Object.values(this.bgPresets).forEach(bm => bm.close());
        this.bgPresets = {};

        // Stop preview and release camera
        this.precallPreview.srcObject = null;
        if (this.localStream) {
            this.localStream.getTracks().forEach(t => t.stop());
            this.localStream = null;
        }

        this.isAudioMuted = false;
        this.precallAction = null;
        this.createRoomBtn.disabled = false;
        this.joinRoomBtn.disabled = false;
        this.confirmJoinBtn.disabled = false;
        this.filterPanel.querySelectorAll('.filter-option').forEach(el => {
            el.classList.toggle('active', el.dataset.filter === 'none');
        });
        this.precallNoCamera.classList.remove('hidden');
        this.precallNoCamera.querySelector('span').textContent = 'カメラを起動中...';
    }

    async confirmPreCall() {
        if (this._noCameraTimeout) { clearTimeout(this._noCameraTimeout); this._noCameraTimeout = null; }
        if (this._precallLoadedHandler) {
            this.precallPreview.removeEventListener('loadeddata', this._precallLoadedHandler);
            this._precallLoadedHandler = null;
        }
        const action = this.precallAction;
        this.precallAction = null;
        this.precallDialog.classList.add('hidden');
        this.filterPanel.classList.add('hidden');
        if (this.bgImagePanel) this.bgImagePanel.classList.add('hidden');
        this.precallPreview.srcObject = null;

        if (action === 'create') {
            await this.createRoom();
        } else {
            await this.joinRoom();
        }
    }

    precallToggleVideo() {
        if (!this.localStream) return;
        const track = this.localStream.getVideoTracks()[0];
        if (!track) return;
        track.enabled = !track.enabled;
        this.precallVideoBtn.classList.toggle('off', !track.enabled);
        this.precallNoCamera.classList.toggle('hidden', track.enabled);
        if (!track.enabled) {
            this.precallNoCamera.querySelector('span').textContent = 'カメラオフ';
        }
        if (this.bgFilterType !== 'none' && this.bgFilterCtx && this.bgFilterCanvas) {
            if (!track.enabled) {
                this.stopBgFilterLoop();
                this.bgFilterCtx.fillStyle = '#000';
                this.bgFilterCtx.fillRect(0, 0, this.bgFilterCanvas.width, this.bgFilterCanvas.height);
            } else {
                this.imageSegmenter ? this.startBgFilterLoop() : this.startCSSFilterLoop();
            }
        }
    }

    precallToggleAudio() {
        if (!this.localStream) return;
        const track = this.localStream.getAudioTracks()[0];
        if (!track) return;
        track.enabled = !track.enabled;
        this.isAudioMuted = !track.enabled;
        this.precallAudioBtn.classList.toggle('off', this.isAudioMuted);
    }

    hangup() {
        this.isLeaving = true;
        this.isReconnecting = false;
        // 録音中なら退室前に必ず停止する(broadcastがまだ生きている＝peer-leaving/room-closed
        // 送信や接続closeより前)。これで録音ファイルが保存され、他参加者のインジケーターも消える
        if (this.isRecording) this.stopRecording();
        // 通話終了時に並べ替え編集モードが残っていれば強制終了(ツールバー非表示・揺れ解除・
        // ドラッグ状態解消)。ウェルカム画面に編集UIが漏れないようにする。保存はしない。
        this.exitReorderMode(false);
        // ホストの退室は即時に全員へ明示通知する(ルーム終了)。切断検知(ICE)だけだと
        // 旧Safariでcloseが発火しない/iPhoneで戻りが数十秒遅れることが実機で確認された。
        // タブ閉じ・クラッシュ時は従来どおり切断検知がフォールバックとして働く。
        // (下のconn.close()はSCTP仕様で送信バッファをflushしてから閉じるため配送される)
        if (this.isHost) this.broadcast({ type: 'room-closed' });
        // ゲストの退室も明示通知する。ICE切断検知はiPhoneで数十秒遅れ・旧Safariでは
        // 発火しないため、無通知だとホストのconnectionsにゴーストが蓄積し、実人数が
        // 少ないのに「ルームは満員です」で再入室拒否される(実機で確認された)
        else this.broadcast({ type: 'peer-leaving' });
        if (this.currentScreenStream) this.stopScreenShare();
        // 他人の共有を見ている最中に退室すると、下でcurrentRemoteSharerIdを先にnullにするため
        // conn closeハンドラ側のガードが効かずexitRemotePresenterModeが呼ばれず、
        // screen-share-containerとpresenter-modeが残留して再入室時に固着する。ここで明示的に解除する
        if (this.currentRemoteSharerId) this.exitRemotePresenterMode();
        this.teardownMixedAudio();
        // 発話インジケーター: ループ停止・全Analyser破棄・AudioContext close
        this.teardownSpeakingDetection();

        // Stop bg filter loop before stopping localStream to avoid reading stopped tracks
        this.stopBgFilterLoop();
        this.cleanupBgFilterResources();
        this.bgFilterType = 'none';
        // Free cached background image bitmaps (uploads and presets)
        if (this.bgImage && !Object.values(this.bgPresets).includes(this.bgImage)) {
            this.bgImage.close();
        }
        this.bgImage = null;
        Object.values(this.bgPresets).forEach(bm => bm.close());
        this.bgPresets = {};

        this.connections.forEach((conn) => conn.close());
        this.connections.clear();

        this.calls.forEach((call) => call.close());
        this.calls.clear();

        this.usernames.clear();

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }

        this.isHost = false;
        this.roomId = null;
        this.roomLocked = false;
        this.roomIdRevealed = false;
        this.isAudioMuted = false;
        this.muteStates.clear();
        this.cameraStates.clear();
        this.handStates.clear();
        this.isHandRaised = false;
        this.recordingStates.clear();
        this.updateRecordingIndicator();
        this.receivingFiles.clear();
        this._msgRate.clear();
        this.currentRemoteSharerId = null;
        this.currentScreenStream = null;
        this.cameraVideoTrack = null;
        this.isConnecting = false;

        // ボタンの視覚状態をリセット（再入室時に前の状態が残らないように）
        this.toggleVideoBtn.classList.remove('off');
        this.toggleAudioBtn.classList.remove('off');
        this.shareScreenBtn.classList.remove('active');
        this.bgFilterBtn.classList.remove('active');
        this.roomLockBtn.classList.remove('locked', 'active');
        this.roomLockBtn.title = 'ルームをロック';
        this.roomLockLabel.textContent = 'ルームをロック';
        this.recordBtn.classList.remove('active', 'recording-active');
        this.recordLabel.textContent = '録音を開始';
        this.updateHandToggleBtn();
        this.createRoomBtn.disabled = false;
        this.joinRoomBtn.disabled = false;
        this.confirmJoinBtn.disabled = false;

        this.videoGrid.innerHTML = '';
        // 退室直前のリアクション残像がウェルカム画面に残らないようクリアする
        if (this.reactionOverlay) this.reactionOverlay.textContent = '';
        this.objectURLs.forEach(url => URL.revokeObjectURL(url));
        this.objectURLs = [];
        this.chatMessages.innerHTML = '';
        // 共有メモ: 内容が残っていれば退室時に自動保存し(ローカル完結)、状態を完全リセットする
        this.downloadMemo();
        this.memoText = '';
        this.memoRev = 0;
        this.memoDirty = false;
        this.memoSnapshots = [];
        this._updateMemoUndoBtn();
        this.memoTextarea.value = '';
        clearTimeout(this._memoDebounceTimer);
        this._memoDebounceTimer = null;
        clearTimeout(this._memoEditingTimer);
        this._memoEditingTimer = null;
        this._memoEditingSignalAt = 0;
        this.memoEditingIndicator.textContent = '';
        this.memoDot.classList.add('hidden');
        this.switchChatTab('chat');
        this.isSendingFile = false;
        this.fileAttachBtn.disabled = false;
        if (this.chatObserver) this.chatObserver.unobserve(this.chatMessages);
        if (this.chatContainer) this.chatContainer.classList.remove('open');
        this.isChatVisible = true;
        this.clearUnreadBadge();
        this.showWelcomeScreen();
        this.showStatus('退室しました', 'connected');
    }

    showHangupModal() {
        this.hangupModal.classList.remove('hidden');
        // モーダル表示直後の誤タップ防止：300ms間は確認ボタンを無効化
        this.hangupConfirmBtn.disabled = true;
        setTimeout(() => { this.hangupConfirmBtn.disabled = false; }, 300);
    }

    hideHangupModal() {
        this.hangupModal.classList.add('hidden');
        this.hangupConfirmBtn.disabled = false;
    }

    showWelcomeScreen() {
        this.welcomeScreen.classList.remove('hidden');
        this.callScreen.classList.add('hidden');
        document.querySelector('.container')?.classList.remove('in-call');
        this.roomInfoDiv.classList.add('hidden');
        this.joinGroup.classList.add('hidden');
        this.joinRoomIdInput.value = '';
        this.updateJoinReadyState();
    }

    showCallScreen() {
        this.welcomeScreen.classList.add('hidden');
        this.callScreen.classList.remove('hidden');
        // モバイルの全画面固定レイアウト用。CSSの :has() 判定はSafari 15.4未満等で
        // 無視されるため、クラス切替で全ブラウザに対応する(style.css .container.in-call)
        document.querySelector('.container')?.classList.add('in-call');
        // 入室時にページスクロールを先頭へ戻す。参加前にルームID入力欄へフォーカスすると
        // confirmJoinBtnへscrollIntoViewした分のスクロールが残り、通話画面でヘッダーが
        // 画面外(上)へずれる問題があるため。あわせてキーボードも閉じる(iOS)。
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        window.scrollTo(0, 0);
        requestAnimationFrame(() => window.scrollTo(0, 0));
        // 通話開始時のチャット初期状態:
        //  PC・横向きiPad(≥769px)は開いた状態、モバイル(≤768px)はボトムシートを閉じた状態。
        const wideScreen = window.matchMedia('(min-width: 769px)').matches;
        if (wideScreen) {
            this.chatContainer?.classList.remove('collapsed');
            this.chatContainer?.classList.add('open');
            this.isChatVisible = true;
        } else {
            this.chatContainer?.classList.remove('open');
            this.chatContainer?.classList.add('collapsed');
            this.isChatVisible = false;
        }
        // Sync button states from pre-call settings
        this.toggleAudioBtn.classList.toggle('off', this.isAudioMuted);
        const videoTrack = this.localStream?.getVideoTracks()[0];
        this.toggleVideoBtn.classList.toggle('off', videoTrack ? !videoTrack.enabled : false);
        this.bgFilterBtn.classList.toggle('active', this.bgFilterType !== 'none');
        if (this.chatObserver) this.chatObserver.observe(this.chatMessages);
        // 映像グリッドのサイズ変化(チャット開閉アニメ・ウィンドウリサイズ等)に追従して再レイアウト
        if (!this._gridResizeObserver && window.ResizeObserver) {
            this._gridResizeObserver = new ResizeObserver(() => this.relayoutVideoGrid());
            this._gridResizeObserver.observe(this.videoGrid);
        }
        this.relayoutVideoGrid();
    }

    showStatus(message, type) {
        if (this.statusDiv) {
            this.statusDiv.textContent = message;
            this.statusDiv.className = `status ${type}`;
        }
        // 録音参加確認トースト(recording-join-toast)はOKタップでのみ消える持続型なので、
        // 通常トーストの巻き添えで消えないよう除外する
        document.querySelectorAll('.toast:not(.recording-join-toast)').forEach(t => t.remove());
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // 録音中の部屋に途中参加した瞬間だけ出す確認トースト。通常のshowStatusと違い
    // 自動では消えず、OKタップでのみ消える(その場で気づいてもらうための能動的な一度きりの通知)
    showRecordingJoinNotice(name) {
        document.querySelectorAll('.recording-join-toast').forEach(t => t.remove());
        const toast = document.createElement('div');
        toast.className = 'toast recording-join-toast';
        const text = document.createElement('span');
        text.textContent = `${name}さんがこの通話を録音中です`;
        const okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.className = 'recording-join-toast-ok';
        okBtn.textContent = 'OK';
        okBtn.addEventListener('click', () => toast.remove());
        toast.append(text, okBtn);
        document.body.appendChild(toast);
    }

    async copyRoomId() {
        const copyIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="0" width="11" height="11" rx="2"/><rect x="0" y="5" width="11" height="11" rx="2"/></svg>`;
        const checkIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#28a745" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 8 6 13 14 3"/></svg>`;
        try {
            await navigator.clipboard.writeText(this.roomId);
            this.copyRoomIdBtn.innerHTML = checkIcon;
            setTimeout(() => { this.copyRoomIdBtn.innerHTML = copyIcon; }, 2000);
            this.showStatus('ルームIDをコピーしました', 'connected');
        } catch {
            this.showStatus('コピーに失敗しました', 'error');
        }
    }

    generateRoomId() {
        const bytes = new Uint8Array(9);
        crypto.getRandomValues(bytes);
        const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
        return Array.from(bytes, b => chars[b % 36]).join('');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.comChat = new ComChat();

    // Safari autoplay policy: resume paused videos on first user interaction
    document.addEventListener('click', () => {
        document.querySelectorAll('video').forEach(v => {
            if (v.paused) v.play().catch(() => {});
        });
    }, { once: true });

    const usernameInput = document.getElementById('username');
    if (usernameInput) {
        window.comChat.username = usernameInput.value || 'ユーザー';
        usernameInput.addEventListener('input', (e) => {
            window.comChat.username = e.target.value || 'ユーザー';
        });
    }
});
