import { Ø1D } from "./Humans.js";
//console.warn(Ø1D.branding);

/**
 * @class uRTC
 * @description An ultra-performant, zero-dependency WebRTC wrapper for P2P data & file synchronization.
 * @version 1.0.0
 * @author 1D
 * @copyright © 2026 Hold'inCorp. All rights reserved.
 * @license Apache-2.0
 * @updated 2026-03-09
 */
export class uRTC {
  /**
   * @param {Object} config - Configuration object
   */
  constructor(config = {}) {
    this.config = {
      iceServers: config.iceServers || [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    };

    this.connection = new RTCPeerConnection(this.config);
    this.dataChannel = null;

    // Internal state
    this._receiveBuffer = [];
    this._receivedSize = 0;
    this._currentFileMeta = null;

    // Public Events
    this.onOpen = () => {};
    this.onData = (data) => {};
    this.onSignal = (signal) => {};
    this.onFileProgress = (percent) => {};
    this.onFileReceived = (blob, name) => {};

    this._setupICE();
    this._listenForRemoteChannel();

    // Reliable Public Demo Server (PieSocket)
    this.signalingServer = config.signalingServer || "wss://free.piesocket.com/v3/demo?api_key=VCXCEuvhGcBDP7XhiJJrvUDvR1eCc4unSMRefCH8&notify=1&room="; 
    this.socket = null;
  }

  /**
   * Automatically join a room and connect to peers using a WebSocket signaling server.
   * @param {string} roomId - The unique identifier for the connection room.
   */
  autoConnect(roomId) {
    const cleanId = roomId.replace(/^#?\/?/, '');
    const finalUrl = `${this.signalingServer}${cleanId}`;
    
    console.log(`uRTC: Attempting connection to ${finalUrl}`);
    this.socket = new WebSocket(finalUrl);

    this.socket.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "offer") {
          await this.acceptOffer(JSON.stringify(msg));
          this.onSignal = (answer) => {
            if (this.socket.readyState === WebSocket.OPEN) this.socket.send(answer);
          };
        } 
        else if (msg.type === "answer") {
          await this.finalize(JSON.stringify(msg));
        }
      } catch (error) {
        // Silently handle non-JSON messages if the server sends them
      }
    };

    this.socket.onopen = () => {
      console.log("uRTC: Signaling socket opened.");
      this.onSignal = (offer) => {
        if (this.socket.readyState === WebSocket.OPEN) this.socket.send(offer);
      };
      this.createOffer();
    };

    this.socket.onerror = (error) => console.error("uRTC: Signaling WebSocket error", error);
    this.socket.onclose = () => console.warn("uRTC: Signaling socket closed.");
  }

  async createOffer() {
    this.dataChannel = this.connection.createDataChannel("uRTC-Bus");
    this._bindChannelEvents();
    const offer = await this.connection.createOffer();
    await this.connection.setLocalDescription(offer);
  }

  async acceptOffer(remoteSdp) {
    const desc = new RTCSessionDescription(JSON.parse(remoteSdp));
    await this.connection.setRemoteDescription(desc);
    const answer = await this.connection.createAnswer();
    await this.connection.setLocalDescription(answer);
  }

  async finalize(remoteAnswer) {
    const desc = new RTCSessionDescription(JSON.parse(remoteAnswer));
    await this.connection.setRemoteDescription(desc);
  }

  send(payload) {
    if (!this._isChannelReady()) return;
    const data = typeof payload === "object" ? JSON.stringify({ type: 'json', content: payload }) : payload;
    this.dataChannel.send(data);
  }

  async sendFile(file) {
    if (!this._isChannelReady()) return;
    const CHUNK_SIZE = 16384;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    this.send({ type: 'file-meta', name: file.name, size: file.size });

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = await file.slice(start, end).arrayBuffer();
      this.dataChannel.send(chunk);
      this.onFileProgress(Math.round(((i + 1) / totalChunks) * 100));
    }
  }

  // --- PRIVATE METHODS ---

  _setupICE() {
    this.connection.onicecandidate = (event) => {
      if (!event.candidate && this.connection.localDescription) {
        this.onSignal(JSON.stringify(this.connection.localDescription));
      }
    };
  }

  _listenForRemoteChannel() {
    this.connection.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this._bindChannelEvents();
    };
  }

  _bindChannelEvents() {
    if (!this.dataChannel) return;
    this.dataChannel.onopen = () => this.onOpen();
    this.dataChannel.onmessage = (event) => this._handleMessage(event.data);
  }

  _handleMessage(data) {
    if (data instanceof ArrayBuffer) {
      this._receiveBuffer.push(data);
      this._receivedSize += data.byteLength;
      if (this._currentFileMeta) {
        this.onFileProgress(Math.round((this._receivedSize / this._currentFileMeta.size) * 100));
        if (this._receivedSize === this._currentFileMeta.size) {
          const blob = new Blob(this._receiveBuffer);
          this.onFileReceived(blob, this._currentFileMeta.name);
          this._receiveBuffer = []; this._receivedSize = 0;
        }
      }
      return;
    }
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'file-meta') { this._currentFileMeta = msg; }
      else if (msg.type === 'json') { this.onData(msg.content); }
      else { this.onData(data); }
    } catch (e) { this.onData(data); }
  }

  _isChannelReady() {
    return this.dataChannel && this.dataChannel.readyState === "open";
  }
}
