const SERVER_URL = "wss://pikavolley-relay-server.onrender.com"; 

class RelayChannel {
  constructor() {
    this.ws = null;
    this.roomId = null;
    this._onOpenCallback = null;
    this._onMessageCallback = null;
  }

  /**
   * 릴레이 서버에 접속합니다.
   * @param {string} roomId - 접속할 방 ID
   * @param {() => void} onOpenCallback - 연결 성공 시 호출될 콜백
   */
  connect(roomId, onOpenCallback) {
    if (this.ws) {
      console.warn("Relay channel already connected.");
      return;
    }
    
    this.roomId = roomId;
    this._onOpenCallback = onOpenCallback;
    const connectUrl = `${SERVER_URL}/${roomId}`;
    console.log(`Connecting to relay server at: ${connectUrl}`);

    this.ws = new WebSocket(connectUrl);

    this.ws.onopen = () => {
      console.log("Relay server connected.");
      if (this._onOpenCallback) {
        this._onOpenCallback();
      }
    };

    this.ws.onmessage = (event) => {
      if (this._onMessageCallback) {
        try {
          const data = JSON.parse(event.data);
          this._onMessageCallback(data);
        } catch (e) {
          console.error("Failed to parse server message:", e);
        }
      }
    };

    this.ws.onclose = () => {
      console.log("Relay server disconnected.");
      this.ws = null;
    };

    this.ws.onerror = (err) => {
      console.error("Relay WebSocket error:", err);
    };
  }

  /**
   * 서버로 JSON 메시지를 전송합니다.
   * @param {object} data - 전송할 객체
   */
  send(data) {
    if (this.ws && this.ws.readyState === 1 /* WebSocket.OPEN */) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.error("Relay channel is not open. Cannot send message.");
    }
  }

  /**
   * 서버로부터 메시지를 수신할 콜백을 등록합니다.
   * @param {(data: object) => void} callback
   */
  onMessage(callback) {
    this._onMessageCallback = callback;
  }
}

// 싱글톤(Singleton) 인스턴스로 export
export const relayChannel = new RelayChannel();