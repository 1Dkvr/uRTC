import { Ø1D } from "./Humans.js";

/**
 * @class uRTC
 * @description An ultra-performant, zero-dependency WebRTC wrapper for P2P data & file synchronization.
 * @version 1.0.220
 * @author 1D
 * @copyright © 2026 Hold'inCorp. All rights reserved.
 * @license Apache-2.0
 * @updated 2026-03-09
 */
export class uRTC {
  constructor(config = {}) {
    this.config = {
      // On garde Google pour la stabilité
      iceServers: config.iceServers || [{ urls: "stun:stun.l.google.com:19302" }]
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
    this.onFileReceived = (blob, name) => {};

    this._setupICE();
    this._listenForRemoteChannel();
  }

  /**
   * Crée l'offre et prépare le terrain.
   */
  async createOffer() {
    try {
      this.dataChannel = this.connection.createDataChannel("uRTC-Bus");
      this._bindChannelEvents();

      const offer = await this.connection.createOffer();
      await this.connection.setLocalDescription(offer);
      
      // On envoie la base tout de suite (instantané)
      this._emitSignal();
    } catch (err) {
      console.error("uRTC: Create Offer Error", err);
    }
  }

  /**
   * Accepte le signal et génère la réponse.
   */
  async handleSignal(signalData) {
    try {
      const signal = JSON.parse(signalData);
      await this.connection.setRemoteDescription(new RTCSessionDescription(signal));

      if (signal.type === "offer") {
        const answer = await this.connection.createAnswer();
        await this.connection.setLocalDescription(answer);
        this._emitSignal();
      }
    } catch (err) {
      console.error("uRTC: Handle Signal Error", err);
    }
  }

  /**
   * Envoie le signal actuel à l'interface
   */
  _emitSignal() {
    if (this.connection.localDescription) {
      this.onSignal(JSON.stringify(this.connection.localDescription));
    }
  }

  _setupICE() {
    // Dès qu'un chemin réseau (ICE) est trouvé, on met à jour le signal
    this.connection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("uRTC: ICE Candidate found, updating signal...");
        this._emitSignal();
      } else {
        console.log("uRTC: ICE Gathering Complete.");
      }
    };
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
      if (msg.type === 'file-meta') this._currentFileMeta = msg;
      else if (msg.type === 'json') this.onData(msg.content);
    } catch (e) { this.onData(data); }
  }

  _isChannelReady() {
    return this.dataChannel && this.dataChannel.readyState === "open";
  }
}
