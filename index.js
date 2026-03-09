import { Ø1D } from "./Humans.js";

console.warn(Ø1D.branding);

/**
 * @class uRTC
 * @description An ultra-performant, zero-dependency WebRTC wrapper for P2P data & file synchronization.
 * @version 1.0.0
 * @author 1D
 * @copyright © 2026 Hold'inCorp. All rights reserved.
 * @license Apache-2.0
 * @updated 26.03.08
 */
export class uRTC {
  /**
   * @param {Object} config - Configuration object
   * @param {Array} config.iceServers - List of STUN/TURN servers
   */
  constructor(config = {}) {
    this.config = {
      iceServers: config.iceServers || [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    };

    /** @type {RTCPeerConnection} */
    this.connection = new RTCPeerConnection(this.config);
    /** @type {RTCDataChannel|null} */
    this.dataChannel = null;

    // Internal state for file chunking
    this._receiveBuffer = [];
    this._receivedSize = 0;

    // Public Events (Hooks)
    this.onOpen = () => {};
    this.onData = (data) => {};
    this.onSignal = (signal) => {};
    this.onFileProgress = (percentage) => {};
    this.onFileReceived = (blob, fileName) => {};

    this._setupICE();
    this._listenForRemoteChannel();
  }

  /**
   * Generates a connection offer (Initiator)
   * @returns {Promise<void>}
   */
  async createOffer() {
    this.dataChannel = this.connection.createDataChannel("uRTC-Bus");
    this._bindChannelEvents();

    const offer = await this.connection.createOffer();
    await this.connection.setLocalDescription(offer);
  }

  /**
   * Accepts a remote offer and creates an answer
   * @param {string} remoteSdp - The JSON stringified SDP offer
   */
  async acceptOffer(remoteSdp) {
    const desc = new RTCSessionDescription(JSON.parse(remoteSdp));
    await this.connection.setRemoteDescription(desc);

    const answer = await this.connection.createAnswer();
    await this.connection.setLocalDescription(answer);
  }

  /**
   * Finalizes the handshake with the remote answer
   * @param {string} remoteAnswer - The JSON stringified SDP answer
   */
  async finalize(remoteAnswer) {
    const desc = new RTCSessionDescription(JSON.parse(remoteAnswer));
    await this.connection.setRemoteDescription(desc);
  }

  /**
   * Sends data (Object or String) through the P2P channel
   * @param {any} payload 
   */
  send(payload) {
    if (!this._isChannelReady()) return;
    const data = typeof payload === "object" ? JSON.stringify({ type: 'json', content: payload }) : payload;
    this.dataChannel.send(data);
  }

  /**
   * Sends a file by slicing it into small chunks (High Performance)
   * @param {File} file 
   */
  async sendFile(file) {
    if (!this._isChannelReady()) return;

    const CHUNK_SIZE = 16384; // 16KB per chunk
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    // Notify the receiver about the incoming file
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
      if (!event.candidate) {
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
    // 1. Handle Binary Data (File Chunks)
    if (data instanceof ArrayBuffer) {
      this._receiveBuffer.push(data);
      this._receivedSize += data.byteLength;
      
      const progress = Math.round((this._receivedSize / this._currentFileMeta.size) * 100);
      this.onFileProgress(progress);

      if (this._receivedSize === this._currentFileMeta.size) {
        const blob = new Blob(this._receiveBuffer);
        this.onFileReceived(blob, this._currentFileMeta.name);
        // Reset buffers
        this._receiveBuffer = [];
        this._receivedSize = 0;
      }
      return;
    }

    // 2. Handle Text/JSON Data
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'file-meta') {
        this._currentFileMeta = msg; // Store file info for upcoming chunks
      } else if (msg.type === 'json') {
        this.onData(msg.content);
      } else {
        this.onData(data);
      }
    } catch (e) {
      this.onData(data);
    }
  }

  _isChannelReady() {
    return this.dataChannel && this.dataChannel.readyState === "open";
  }
}
