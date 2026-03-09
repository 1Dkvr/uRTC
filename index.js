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
        { urls: "stun:stun.l.google.com:19302" }
      ],
    };

    this.connection = new RTCPeerConnection(this.config);
    this.dataChannel = null;
    this._receiveBuffer = [];
    this._receivedSize = 0;
    this._currentFileMeta = null;

    this.onOpen = () => {};
    this.onData = (data) => {};
    this.onSignal = (signal) => {};
    this.onFileProgress = (p) => {};
    this.onFileReceived = (b, n) => {};

    this._setupICE();
    this._listenForRemoteChannel();

    // On utilise un service qui bypass souvent les filtres : PeerJS public local
    this.signalingServer = config.signalingServer || "wss://0.peerjs.com/peerjs?key=peerjs&id=";
    this.socket = null;
  }

  autoConnect(roomId) {
    // On génère un ID unique pour cette session pour ne pas s'auto-connecter
    const clientId = Math.random().toString(36).substring(7);
    const finalUrl = `${this.signalingServer}${clientId}&room=${roomId.replace('#','')}`;
    
    console.log(`uRTC: Trying PeerJS Public Relay -> ${finalUrl}`);
    this.socket = new WebSocket(finalUrl);

    this.socket.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "offer") {
          await this.acceptOffer(JSON.stringify(msg));
          this.onSignal = (ans) => this.socket.send(ans);
        } else if (msg.type === "answer") {
          await this.finalize(JSON.stringify(msg));
        }
      } catch (e) {}
    };

    this.socket.onopen = () => {
      console.log("uRTC: Socket OPEN!");
      this.onSignal = (off) => this.socket.send(off);
      this.createOffer();
    };

    this.socket.onerror = (e) => console.error("uRTC: Socket Error", e);
    this.socket.onclose = () => console.warn("uRTC: Socket Closed");
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
