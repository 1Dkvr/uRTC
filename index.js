import { Ø1D } from "./Humans.js";

/**
 * @class uRTC
 * @description An ultra-performant, zero-dependency WebRTC wrapper for P2P data & file synchronization.
 * @version 1.0.200
 * @author 1D
 * @copyright © 2026 Hold'inCorp. All rights reserved.
 * @license Apache-2.0
 * @updated 2026-03-09
 */
export class uRTC {
  constructor(config = {}) {
    this.config = {
      iceServers: config.iceServers || [{ urls: "stun:stun.l.google.com:19302" }]
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
    this.onFileProgress = (p) => {};
    this.onFileReceived = (b, n) => {};

    this._setupICE();
    this._listenForRemoteChannel();
  }

  /**
   * Generates an offer to be sent to a peer
   */
  async createOffer() {
    console.log("uRTC: Button clicked, starting offer..."); // Ajoute ça
    this.dataChannel = this.connection.createDataChannel("uRTC-Bus");
    this._bindChannelEvents();
    const offer = await this.connection.createOffer();
    await this.connection.setLocalDescription(offer);
    console.log("uRTC: Local description set, gathering ICE..."); // Et ça
  }

  /**
   * Accepts a remote signal (Offer or Answer)
   * @param {string} signalData - The JSON stringified SDP
   */
  async handleSignal(signalData) {
    const signal = JSON.parse(signalData);
    if (signal.type === "offer") {
      await this.connection.setRemoteDescription(new RTCSessionDescription(signal));
      const answer = await this.connection.createAnswer();
      await this.connection.setLocalDescription(answer);
    } else if (signal.type === "answer") {
      await this.connection.setRemoteDescription(new RTCSessionDescription(signal));
    }
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

  // --- PRIVATE ---

  _setupICE() {
    this.connection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("uRTC: New ICE Candidate found...");
        // Optionnel : on pourrait envoyer les candidats un par un, 
        // mais pour ton test manuel, on attend le pack complet.
      } else {
        // event.candidate est nul : la recherche est terminée !
        console.log("uRTC: ICE Gathering Complete.");
        if (this.connection.localDescription) {
          this.onSignal(JSON.stringify(this.connection.localDescription));
        }
      }
    };

    // Sécurité pour Mobile : Si après 3 secondes on n'a pas fini, 
    // on force quand même l'affichage du signal actuel
    this.connection.onicegatheringstatechange = () => {
      console.log("uRTC: Gathering State ->", this.connection.iceGatheringState);
      if (this.connection.iceGatheringState === "complete") {
        this.onSignal(JSON.stringify(this.connection.localDescription));
      }
    };
  }

  _listenForRemoteChannel() {
    this.connection.ondatachannel = (e) => {
      this.dataChannel = e.channel;
      this._bindChannelEvents();
    };
  }

  _bindChannelEvents() {
    if (!this.dataChannel) return;
    this.dataChannel.onopen = () => this.onOpen();
    this.dataChannel.onmessage = (e) => this._handleMessage(e.data);
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
