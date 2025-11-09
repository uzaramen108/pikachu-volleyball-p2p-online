/**
 * This is the main script which executes the p2p online version game.
 * General explanations for the all source code files of the game are following.
 *
 ********************************************************************************************************************
 * This p2p online version of the Pikachu Volleyball is developed based on
 * the Pikachu Volleyball offline web version (https://github.com/gorisanson/pikachu-volleyball)
 * which is made by reverse engineering the core part of the original Pikachu Volleyball game
 * which is developed by "1997 (C) SACHI SOFT / SAWAYAKAN Programmers" & "1997 (C) Satoshi Takenouchi".
 ********************************************************************************************************************
 *
 * This p2p online version game is mainly composed of two parts below.
 *  1) Offline version: All the offline web version source code files is in the directory "offline_version_js".
 *  2) WebRTC data channels: It utilizes WebRTC data channels to communicate with the peer.
 *                           The peer-to-peer online functions are contained in "data_channel.js"
 *
 * The game is deterministic on the user (keyboard) inputs except the RNG (random number generator) used in
 * "offline_version_js/physics.js" and "offline_version_js/cloud_and_wave.js". (The RNG is contained
 * in "offline_version_js/rand.js".) So if the RNG is the same on both peers, only the user inputs need
 * to be communicated to maintain the same game state between the peers. In this p2p online version, the RNG
 * is set to the same thing on both peers at the data channel open event (handled by the function
 * "dataChannelOpened" in "data_channel.js"), then the user inputs are communicated via the data channel.
 *
 * And explanations for other source files are below.
 *  - "pikavolley_online.js": A wrapper for "offline_version_js/pikavolley.js".
 *  - "keyboard_online.js": A wrapper for offline version "offline_version_js/keyboard.js".
 *                          This module gets user inputs and load them up onto the data channel to the peer.
 *  - "generate_pushid.js": Generate a room ID easily distinguishable by human eye.
 *  - "mod.js": To maintain game sync, sync counter is attached for each user input, and mod is used to
 *              make sync counter cycle in a range [0, 255] which fits in a byte.
 *  - "ui_online.js": For the user interface of the html page and inputs/outputs relevant to html elements.
 *  - "chat_display.js": For displaying chat messages.
 *  - "firebase_config.template.js": This p2p online version utilized firebase cloud firestore to establish
 *                                   webRTC data channel connection between peers. Fill this template and
 *                                   change the file name to "firebase_config.js".
 *  - "rtc_configuration.js": Contains RTCPeerConnection configuration.
 *  - "quick_match.js": It is for the quick match function. Manages communication with the quick match server.
 *  - "quick_match_server_url.template.js": Fill this template the url of the quick match server and change
 *                                          the file name to "quick_match_server_url.js"
 */
"use strict";

// 1. PIXI 및 공통 모듈 (기존과 동일)
import { settings } from "@pixi/settings";
import { SCALE_MODES } from "@pixi/constants";
import { Renderer, BatchRenderer, autoDetectRenderer } from "@pixi/core";
import { Prepare } from "@pixi/prepare";
import { Container } from "@pixi/display";
import { Loader } from "@pixi/loaders";
import { SpritesheetLoader } from "@pixi/spritesheet";
import { Ticker } from "@pixi/ticker";
import { CanvasRenderer } from "@pixi/canvas-renderer";
import { CanvasSpriteRenderer } from "@pixi/canvas-sprite";
import { CanvasPrepare } from "@pixi/canvas-prepare";
import "@pixi/canvas-display";
import { ASSETS_PATH } from "./offline_version_js/assets_path.js";
import "../style.css";

// 2. 플레이어용 모듈
import { PikachuVolleyballOnline } from "./pikavolley_online.js";
import { channel } from "./data_channel/data_channel.js";
import {
  setUpUI,
  setUpUIAfterLoadingGameAssets,
  // [수정] 1단계에서 export한 함수를 import하네
  setUpToShowDropdownsAndSubmenus,
} from "./ui_online.js";
import { setUpUIForBlockingOtherUsers } from "./block_other_players/ui.js";
import { setUpUIForManagingBadWords } from "./bad_words_censorship/ui.js";
import { setGetSpeechBubbleNeeded } from "./chat_display.js";

// 3. [신규] 관전자용 모듈
import { PikachuVolleyballSpectator } from "./pikavolley_spectator.js";
import { PikaUserInputWithSync } from "./keyboard_online.js";
import { convert5bitNumberToUserInput } from "./utils/input_conversion.js";
import { mod } from "./utils/mod.js";
import { SYNC_DIVISOR } from "./data_channel/data_channel.js";

// 4. PIXI 설정 (기존과 동일)
const TEXTURES = ASSETS_PATH.TEXTURES;
TEXTURES.WITH_COMPUTER = TEXTURES.WITH_FRIEND;

Renderer.registerPlugin("prepare", Prepare);
Renderer.registerPlugin("batch", BatchRenderer);
CanvasRenderer.registerPlugin("prepare", CanvasPrepare);
CanvasRenderer.registerPlugin("sprite", CanvasSpriteRenderer);
Loader.registerPlugin(SpritesheetLoader);

settings.RESOLUTION = 2;
settings.SCALE_MODE = SCALE_MODES.NEAREST;
settings.ROUND_PIXELS = true;

const renderer = autoDetectRenderer({
  width: 432,
  height: 304,
  // ... (나머지 렌더러 설정은 자네의 원본과 동일) ...
  forceCanvas: true,
});

const stage = new Container();
const ticker = new Ticker();
const loader = new Loader();

document.querySelector("#game-canvas-container").appendChild(renderer.view);
renderer.render(stage);

// 5. 에셋 로드 (기존과 동일)
loader.add(ASSETS_PATH.SPRITE_SHEET);
for (const prop in ASSETS_PATH.SOUNDS) {
  loader.add(ASSETS_PATH.SOUNDS[prop]);
}
setUpLoaderProgressBar(); // 로딩 바 설정은 공통

// 6. [핵심] 모드 분기 (플레이어 vs 관전자)
const urlParams = new URLSearchParams(window.location.search);
const spectateRoomId = urlParams.get("spectate");

const RELAY_SERVER_URL = "wss://pikavolley-relay-server.onrender.com";
let player1InputQueue = []; // 관전자용
let player2InputQueue = []; // 관전자용

if (spectateRoomId) {
  // ----- [A] 관전자 모드로 부팅 -----
  console.log("관전 모드로 시작합니다. Room ID:", spectateRoomId);
  document.getElementById("before-connection").style.display = "none";
  loader.load(() => setupSpectator(spectateRoomId));
} else {
  // ----- [B] 기존 플레이어 모드로 부팅 -----
  console.log("플레이어 모드로 시작합니다.");
  channel.callbackAfterDataChannelOpened = () => {
    loader.load(setupPlayer);
  };
  setUpUI();
  setUpUIForBlockingOtherUsers();
  setUpUIForManagingBadWords();
}

// 7. 로딩 바 설정 (기존 함수)
function setUpLoaderProgressBar() {
  // ... (자네가 준 코드와 동일) ...
  const loadingBox = document.getElementById("loading-box");
  const progressBar = document.getElementById("progress-bar");
  loader.onProgress.add(() => {
    progressBar.style.width = `${loader.progress}%`;
  });
  loader.onComplete.add(() => {
    loadingBox.classList.add("hidden");
  });
}

// 8. [수정] 플레이어용 셋업 (기존 setup 함수)
function setupPlayer() {
  const pikaVolley = new PikachuVolleyballOnline(stage, loader.resources);
  setUpUIAfterLoadingGameAssets(pikaVolley, ticker);
  setGetSpeechBubbleNeeded(pikaVolley);
  startPlayer(pikaVolley);
}

// 9. [수정] 플레이어용 Ticker 시작 (기존 start 함수)
function startPlayer(pikaVolley) {
  ticker.maxFPS = pikaVolley.normalFPS;
  ticker.add(() => {
    renderer.render(stage);
    pikaVolley.gameLoop(); // 플레이어용 게임 루프
  });
  ticker.start();
}

// 10. [신규] 관전자용 셋업
function setupSpectator(roomId) {
  // 1. 관전자용 게임 클래스 생성
  console.log("started setup spectator");
  const game = new PikachuVolleyballSpectator(
    stage,
    loader.resources,
    player1InputQueue,
    player2InputQueue
  );

  // 2. 관전자용 UI *수동* 설정
  document.getElementById("flex-container").classList.remove("hidden");

  // 2-A. '나가기' 버튼 수동 설정
  const exitBtn = document.getElementById("exit-btn");
  if (exitBtn) {
    exitBtn.addEventListener("click", () => {
      window.location.href = "./index.html"; // 메인으로
    });
  }

  // 2-B. [수정] '설정' 메뉴 버튼 활성화
  // 1단계에서 export한 함수를 호출하네.
  try {
    setUpToShowDropdownsAndSubmenus();
  } catch (e) {
    console.error("'setUpToShowDropdownsAndSubmenus' 호출 중 오류:", e);
  }

  // 3. 플레이어용 UI 강제 숨김
  document.getElementById("loading-box").classList.add("hidden");
  document.getElementById("peer-loading-box").classList.add("hidden");
  document.getElementById("ping-box").classList.add("hidden");
  document.getElementById("save-replay-btn").style.display = "none";
  document.getElementById("block-this-peer-btn").style.display = "none";
  document.getElementById("chat-input-here").style.display = "none";

  // 4. 관전자용 상태창 보이기
  const statusBox = document.getElementById("spectator-status-box");
  if (statusBox) {
    statusBox.style.display = "block";
    statusBox.classList.remove("hidden");
  }

  // 5. 릴레이 서버 접속
  console.log("started contacting relay server");
  connectToRelay(roomId);

  // 6. 관전자용 Ticker 시작
  startSpectator(game);
}

// 11. [신규] 관전자용 Ticker 시작
function startSpectator(pikaVolley) {
  console.log("started ticker for spectator");
  ticker.maxFPS = pikaVolley.normalFPS;
  ticker.add(() => {
    renderer.render(stage);
    pikaVolley.spectatorGameLoop();
  });
  ticker.start();
}
// 12. [신규] 릴레이 서버 접속 로직 (기존과 동일)
function connectToRelay(roomId) {
  // ... (이전과 동일한 릴레이 접속 코드) ...
  const wsUrl = `${RELAY_SERVER_URL}/${roomId}`;
  const socket = new WebSocket(wsUrl);
  socket.binaryType = "arraybuffer";
  const statusElement = document.getElementById("spectator-status-text");
  
  console.log(wsUrl);
  console.log(socket);

  socket.onopen = () => {
    console.log(`[${roomId}] Spectator connection open. Requesting watch...`);
    if (statusElement)
      statusElement.textContent =
        "방에 접속했습니다. 게임 데이터를 기다립니다...";
    socket.send(JSON.stringify({ type: "watch" }));
  };

  socket.onmessage = (event) => {
    const statusBox = document.getElementById("spectator-status-box");
    if (statusBox) statusBox.classList.add("hidden");

    const data = event.data;

    // [라우터 1] 메시지가 문자열(string)인가? (JSON 내역)
    if (typeof data === "string") {
      try {
        const msg = JSON.parse(data);
        if (msg.type === "history") {
          console.log(`[Spectator] Game history (list) received. ${msg.history.length} buffers.`);
          // '리스트'에 담긴 모든 ArrayBuffer를 한 번에 처리하네
          msg.history.forEach(processMessageData); 
        }
      } catch (e) {
        console.error("Failed to parse history JSON:", e);
      }
    } 
    // [라우터 2] 메시지가 ArrayBuffer인가? (생방송)
    else if (data instanceof ArrayBuffer) {
      processMessageData(data); // 생방송 데이터 1개 처리
    }
  };

  socket.onclose = () => {
    console.log("Relay connection closed.");
    if (statusElement)
      statusElement.textContent = "관전이 종료되었습니다. (연결 끊김)";
    const statusBox = document.getElementById("spectator-status-box");
    if (statusBox) statusBox.classList.remove("hidden");
  };

  socket.onerror = (err) => {
    console.error("Relay socket error:", err);
    if (statusElement)
      statusElement.textContent = "오류가 발생했습니다. (연결 실패)";
    const statusBox = document.getElementById("spectator-status-box");
    if (statusBox) statusBox.classList.remove("hidden");
  };
}

/**
 * [신규] 'processMessageData'
 * '내역'이든 '생방송'이든, 모든 ArrayBuffer를 처리하는 공통 함수
 * (기존 onmessage의 로직을 이 함수로 분리했네)
 * @param {ArrayBuffer} data (playerID 1바이트 + input 데이터)
 */
function processMessageData(data) {
  const view = new DataView(data);
  const playerID = view.getUint8(0);
  const inputData = data.slice(1); // 1바이트 ID 제거
  const targetQueue = (playerID === 0) ? player1InputQueue : player2InputQueue;
  
  // [수정] 큐를 채우는 'processInputData' 함수를 호출하네
  processInputDataToQueue(inputData, targetQueue);
}


// 13. [신규] 큐 처리 로직
// [수정] 함수 이름을 'processInputDataToQueue'로 변경 (혼동 방지)
function processInputDataToQueue(inputData, targetQueue) {
  // ... (자네가 03:59에 줬던 'processInputData' 함수 내용과 100% 동일) ...
  const dataView = new DataView(inputData);
  const syncCounter0 = dataView.getUint16(0, true);

  for (let i = 0; i < inputData.byteLength - 2; i++) {
    const syncCounter = mod(syncCounter0 + i, SYNC_DIVISOR);
    const byte = dataView.getUint8(2 + i);
    const input = convert5bitNumberToUserInput(byte);
    const inputWithSync = new PikaUserInputWithSync(
      syncCounter,
      input.xDirection,
      input.yDirection,
      input.powerHit
    );
    targetQueue.push(inputWithSync);
  }
}