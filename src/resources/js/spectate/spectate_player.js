// [ spectator_player.js (신규 파일) ]
// 'replay_player.js'를 기반으로 개조

'use strict';
// --- PixiJS 모듈 (replay_player.js와 동일) ---
import { settings } from '@pixi/settings';
import { SCALE_MODES } from '@pixi/constants';
import { Renderer, BatchRenderer, autoDetectRenderer } from '@pixi/core';
import { Prepare } from '@pixi/prepare';
import { Container } from '@pixi/display';
import { Loader } from '@pixi/loaders';
import { SpritesheetLoader } from '@pixi/spritesheet';
import { Ticker } from '@pixi/ticker';
import { CanvasRenderer } from '@pixi/canvas-renderer';
import { CanvasSpriteRenderer } from '@pixi/canvas-sprite';
import { CanvasPrepare } from '@pixi/canvas-prepare';
import '@pixi/canvas-display';

// --- 게임 모듈 ---
import { ASSETS_PATH } from '../offline_version_js/assets_path.js';
// [중요] 'pikavolley_replay.js'가 아닌, 학생이 새로 만든 'pikavolley_spectate.js'를 import
import { PikachuVolleyballReplay } from './pikavolley_spectate.js'; 
import { setGetSpeechBubbleNeeded, hideChat } from '../chat_display.js';
// [중요] 'ui_spectate.js'에서 모든 UI 헬퍼 함수들을 import
import {
  setMaxForScrubberRange,
  adjustPlayPauseBtnIcon,
  showTotalTimeDuration,
  showTimeCurrent,
  enableReplayScrubberAndBtns,
  hideNoticeEndOfSpectation,
  noticeFileOpenError,
  adjustFPSInputValue,
  moveScrubberTo,
} from './ui_spectate.js'; 
import '../../style.css';

// [신규] 서버 주소
const SERVER_URL = "wss://pikavolley-relay-server.onrender.com";

class SpectatorPlayer { // ReplayPlayer -> SpectatorPlayer
  constructor() {
    // --- PixiJS 설정 (replay_player.js와 100% 동일) ---
    Renderer.registerPlugin('prepare', Prepare);
    Renderer.registerPlugin('batch', BatchRenderer);
    CanvasRenderer.registerPlugin('prepare', CanvasPrepare);
    CanvasRenderer.registerPlugin('sprite', CanvasSpriteRenderer);
    Loader.registerPlugin(SpritesheetLoader);
    settings.RESOLUTION = 2;
    settings.SCALE_MODE = SCALE_MODES.NEAREST;
    settings.ROUND_PIXELS = true;

    this.ticker = new Ticker();
    this.ticker.minFPS = 1;
    this.renderer = autoDetectRenderer({
      width: 432,
      height: 304,
      antialias: false,
      backgroundColor: 0x000000,
      backgroundAlpha: 1,
      forceCanvas: true,
    });
    this.stage = new Container();
    this.loader = new Loader();
    this.pikaVolley = null; // 실제 게임 로직 객체
    this.playBackSpeedTimes = 1;
    this.playBackSpeedFPS = null;
    this.ws = null; // [신규] WebSocket 객체
  }
  
  startSpectating(roomId) {
    if (this.ws) { return; } // 이미 연결됨
    
    const connectUrl = `${SERVER_URL}/${roomId}`;
    this.ws = new WebSocket(connectUrl);

    this.ws.onopen = () => {
      this.ws.send(JSON.stringify({ type: "watch" }));
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "replay_pack") {
          // 'replay_pack'을 받으면 게임 엔진 초기화
          this.initialize(data.pack); 
        } else if (data.type === "live_input") {
          // 'live_input'을 받으면 엔진에 데이터 주입
          this.pushInput(data.value);
        } else if (data.type === "live_options") {
          // [신규] 실시간 옵션 변경 수신
          this.pushOptions(data.value);
        }
      } catch (e) {
        console.error("Failed to parse server message:", e);
      }
    };
    
    this.ws.onclose = () => { 
      console.log("WebSocket 연결 종료"); 
      // (여기에 "연결 종료" UI 처리 로직 추가 가능)
    };
    this.ws.onerror = (err) => { 
      console.error("WebSocket 오류:", err);
      // (여기에 "연결 오류" UI 처리 로직 추가 가능)
    };
  }


  // [신규] 2. 게임 엔진 초기화 함수 ('readFile'의 onload 로직을 가져옴)
  initialize(pack) {
    // ... (캔버스 추가, Ticker 설정 동일) ...
    document.querySelector('#game-canvas-container').appendChild(this.renderer.view);
    this.renderer.render(this.stage);
    
    this.ticker.add(() => {
      this.renderer.render(this.stage);
      if (!this.pikaVolley) return;
      showTimeCurrent(this.pikaVolley.timeCurrent);
      showTotalTimeDuration(this.pikaVolley.timeCurrent);
      moveScrubberTo(this.pikaVolley.replayFrameCounter);
      this.pikaVolley.gameLoop();
    });

    // ... (에셋 로더 실행 동일) ...
    this.loader.add(ASSETS_PATH.SPRITE_SHEET);
    for (const prop in ASSETS_PATH.SOUNDS) {
      this.loader.add(ASSETS_PATH.SOUNDS[prop]);
    }

    this.loader.load(() => {
        this.pikaVolley = new PikachuVolleyballReplay(
          // ... (PikaVolleyReplay 생성자 동일) ...
          this.stage,
          this.loader.resources,
          pack.roomID,
          pack.nicknames,
          pack.partialPublicIPs,
          pack.inputs,
          pack.options,
          pack.chats
        );
        //@ts-ignore
        setGetSpeechBubbleNeeded(this.pikaVolley);
        
        this.seekFrame(pack.inputs.length); 
        setMaxForScrubberRange(pack.inputs.length);

        // [수정 1/2] Ticker를 시작하기 *전에* FPS를 동기화합니다.
        // (seekFrame을 실행하면 pikaVolley.normalFPS가 최신값으로 업데이트됨)
        this.ticker.maxFPS = this.pikaVolley.normalFPS;

        this.ticker.start();
        adjustPlayPauseBtnIcon();
        
        // ... (UI 활성화 및 숨기기 로직 동일) ...
        const playPauseBtn = document.getElementById('play-pause-btn');
        const scrubberRangeInput = document.getElementById('scrubber-range-input');
        // @ts-ignore
        if (playPauseBtn) playPauseBtn.disabled = false;
        // @ts-ignore
        if (scrubberRangeInput) scrubberRangeInput.disabled = false;
        const loadingUI = document.getElementById('spectator-loading');
        if (loadingUI) loadingUI.style.display = 'none';
        const controlsUI = document.getElementById('replay-controls');
        if (controlsUI) controlsUI.style.display = 'block';
    });
  }
  
  // [신규] 3. 실시간 'input' 데이터 주입 함수
  pushInput(usersInputNumber) {
    if (!this.pikaVolley) { 
      return; 
    }
    this.pikaVolley.inputs.push(usersInputNumber);
    setMaxForScrubberRange(this.pikaVolley.inputs.length);
  }

  // [신규] 4. 실시간 'options' 데이터 주입 함수
  pushOptions(optionsData) {
    if (!this.pikaVolley) { return; }
    // pikavolley_spectate.js (게임 로직)의 options 배열에 추가
    this.pikaVolley.options.push(optionsData); 
  }


  // --- 'replay_player.js'의 나머지 함수들 (100% 동일) ---
  // (일시정지 중 탐색을 위해 그대로 둠)

  /**
   * Seek the specific frame
   * @param {number} frameNumber
   */
  seekFrame(frameNumber) {
    hideChat();
    hideNoticeEndOfSpectation();
    this.ticker.stop();

    // Cleanup previous pikaVolley
    if (this.pikaVolley) {
      this.pikaVolley.initializeForReplay();
    } else {
      return; // 아직 pikaVolley가 생성되지 않음
    }

    if (frameNumber > 0) {
      for (let i = 0; i < frameNumber; i++) {
        if (i < this.pikaVolley.inputs.length) {
          this.pikaVolley.gameLoopSilent();
        }
      }
      this.renderer.render(this.stage);
    }
    showTimeCurrent(this.pikaVolley.timeCurrent);
  }

  /**
   * Seek forward/backward the relative time (seconds).
   * @param {number} seconds
   */
  seekRelativeTime(seconds) {
    if (!this.pikaVolley) {
      return;
    }
    const seekFrameCounter = Math.max(
      0,
      this.pikaVolley.replayFrameCounter + seconds * this.pikaVolley.normalFPS
    );
    this.seekFrame(seekFrameCounter);
  }

  /**
   * Adjust playback speed by times
   * @param {number} times
   */
  adjustPlaybackSpeedTimes(times) {
    if (!this.pikaVolley) {
      return;
    }
    this.playBackSpeedFPS = null;
    this.playBackSpeedTimes = times;
    this.ticker.maxFPS = this.pikaVolley.normalFPS * this.playBackSpeedTimes;
    adjustFPSInputValue();
  }

  /**
   * Adjust playback speed by fps
   * @param {number} fps
   */
  adjustPlaybackSpeedFPS(fps) {
    this.playBackSpeedTimes = null;
    this.playBackSpeedFPS = fps;
    this.ticker.maxFPS = this.playBackSpeedFPS;
    adjustFPSInputValue();
  }

  stopBGM() {
    if (this.pikaVolley) {
      this.pikaVolley.audio.sounds.bgm.center.stop();
    }
  }

  playBGMProperly() {
    if (!this.pikaVolley) {
      return;
    }
    if (this.pikaVolley.isBGMPlaying) {
      this.pikaVolley.audio.sounds.bgm.center.play({
        start: this.pikaVolley.timeBGM,
      });
    }
  }
}

export const spectatorPlayer = new SpectatorPlayer();

/**
 * Ticker의 maxFPS를 게임 로직의 normalFPS에 맞춰 조정합니다.
 * @param {number} normalFPS
 */
export function setTickerMaxFPSAccordingToNormalFPS(normalFPS) {
  if (spectatorPlayer.playBackSpeedFPS) {
    // 사용자가 'fps'를 직접 지정한 경우, 그것을 우선
    spectatorPlayer.ticker.maxFPS = spectatorPlayer.playBackSpeedFPS;
  } else if (spectatorPlayer.playBackSpeedTimes) {
    // 사용자가 '배속'을 지정한 경우, 배속을 우선
    spectatorPlayer.ticker.maxFPS = normalFPS * spectatorPlayer.playBackSpeedTimes;
  } else {
    // 아무것도 지정하지 않은 경우, 1배속으로 설정
    spectatorPlayer.ticker.maxFPS = normalFPS;
  }
  adjustFPSInputValue();
}