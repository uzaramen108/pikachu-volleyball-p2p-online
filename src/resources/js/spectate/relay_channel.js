const SERVER_URL = "wss://pikavolley-relay-server.onrender.com"; 

class RelayChannel {
  constructor() {
    this.ws = null;
    this.roomId = null;
    this._onOpenCallback = null;
    this._onMessageCallback = null;
  }

  /**
   * Connect to relay server, https://github.com/uzaramen108/pikavolley-relay-server
   * @param {string} roomId
   * @param {() => void} onOpenCallback
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
   * Send JSON message to server
   * @param {object} data
   */
  send(data) {
    if (this.ws && this.ws.readyState === 1 /* WebSocket.OPEN */) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.error("Relay channel is not open. Cannot send message.");
    }
  }

  /**
   * Register callback for receiving message from server.
   * @param {(data: object) => void} callback
   */
  onMessage(callback) {
    this._onMessageCallback = callback;
  }
}

export const relayChannel = new RelayChannel();