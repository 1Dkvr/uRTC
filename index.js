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
      // Un seul serveur STUN rapide pour éviter les timeouts
      iceServers: config.iceServers || [{ urls: "stun:stun.l.google.com:19302" }]
    };

    this.connection = new RTCPeerConnection(this.config);
    this.dataChannel = null;

    // État interne pour les fichiers
    this._receiveBuffer = [];
    this._receivedSize = 0;
    this._currentFileMeta = null;

    // Événements Publics
    this.onOpen = () => {};
    this.onData = (data) => {};
    this.onSignal = (signal) => {};
    this.onFileProgress = (p) => {};
    this.onFileReceived = (blob, name) => {};

    this._setupICE();
    this._listenForRemoteChannel();
  }

  /**
   * Crée une offre WebRTC et déclenche onSignal immédiatement.
   */
  async createOffer() {
    try {
      this.dataChannel = this.connection.createDataChannel("uRTC-Bus");
      this._bindChannelEvents();

      const offer = await this.connection.createOffer();
      await this.connection.setLocalDescription(offer);

      // OPTIMISATION : On n'attend pas les candidats ICE. 
      // On envoie la description locale dès qu'elle est prête.
      this.onSignal(JSON.stringify(this.connection.localDescription));
    } catch (err) {
      console.error("uRTC: Error creating offer", err);
    }
  }

  /**
   * Gère un signal entrant (Offre ou Réponse)
   * @param {string} signalData - JSON stringifié du SDP
   */
  async handleSignal(signalData) {
    try {
      const signal = JSON.parse(signalData);
      const desc = new RTCSessionDescription(signal);
      await this.connection.setRemoteDescription(desc);

      if (signal.type === "offer") {
        const answer = await this.connection.createAnswer();
        await this.connection.setLocalDescription(answer);
        // Envoi immédiat de la réponse
        this.onSignal(JSON.stringify(this.connection.localDescription));
      }
    } catch (err) {
      console.error("uRTC: Error handling signal", err);
    }
  }

  /**
   * Envoie du texte ou un objet JSON
   */
  send(payload) {
    if (!this._isChannelReady()) return;
    const data = typeof payload === "object" ? JSON.stringify({ type: 'json', content: payload }) : payload;
    this.dataChannel.send(data);
  }

  /**
   * Envoie un fichier par morceaux (chunks)
   */
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

  // --- MÉTHODES PRIVÉES ---

  _setupICE() {
    this.connection.onicecandidate = (event) => {
      // Dès qu'un candidat est trouvé, on met à jour le signal via onSignal
      // Cela permet de compléter l'offre au fur et à mesure
      if (this.connection.localDescription) {
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
      if (msg.type === 'file-meta') this._currentFileMeta = msg;
      else if (msg.type === 'json') this.onData(msg.content);
    } catch (e) { this.onData(data); }
  }

  _isChannelReady() {
    return this.dataChannel && this.dataChannel.readyState === "open";
  }
}
