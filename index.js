import { Ø1D } from "./Humans.js";

console.warn(Ø1D.branding);

/**
 * uRTC - Wrapper WebRTC Universel & Gratuit
 * @author 1D
 */
class uRTC {
  constructor(config = {}) {
    // Configuration par défaut : 0€, 100% fonctionnel
    this.iceServers = config.iceServers || [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ];

    this.peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });
    this.dataChannel = null;

    // Callbacks (Événements pour l'utilisateur)
    this.onOpen = () => {};
    this.onData = (data) => {};
    this.onSignal = (signal) => {}; // Pour le copier-coller du code

    this._initDataChannel();
    this._initICE();
  }

  // --- LOGIQUE DE CONNEXION ---

  /**
   * Étape 1 : Créer une offre (celui qui initie)
   */
  async createOffer() {
    this.dataChannel = this.peerConnection.createDataChannel("ultraBus");
    this._setupChannelEvents();

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    
    // On attend que les candidats ICE soient prêts avant d'envoyer le signal
  }

  /**
   * Étape 2 : Accepter une offre et créer une réponse
   */
  async acceptOffer(remoteSDP) {
    const offer = new RTCSessionDescription(JSON.parse(remoteSDP));
    await this.peerConnection.setRemoteDescription(offer);

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
  }

  /**
   * Étape 3 : Finaliser la connexion avec la réponse
   */
  async finalize(remoteAnswer) {
    const answer = new RTCSessionDescription(JSON.parse(remoteAnswer));
    await this.peerConnection.setRemoteDescription(answer);
  }

  // --- LOGIQUE D'ENVOI ---

  /**
   * Envoi de données (JSON ou Texte)
   */
  send(payload) {
    if (this.dataChannel && this.dataChannel.readyState === "open") {
      const data = typeof payload === "object" ? JSON.stringify(payload) : payload;
      this.dataChannel.send(data);
    }
  }

  // --- MÉTHODES PRIVÉES ---

  _initDataChannel() {
    this.peerConnection.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this._setupChannelEvents();
    };
  }

  _setupChannelEvents() {
    this.dataChannel.onopen = () => this.onOpen();
    this.dataChannel.onmessage = (event) => {
      let data = event.data;
      try { data = JSON.parse(event.data); } catch(e) {}
      this.onData(data);
    };
  }

  _initICE() {
    this.peerConnection.onicecandidate = (event) => {
      if (!event.candidate) {
        // Quand il n'y a plus de candidats, le signal est complet
        this.onSignal(JSON.stringify(this.peerConnection.localDescription));
      }
    };
  }
}
