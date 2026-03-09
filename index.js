import { Ø1D } from "./Humans.js";

/**
 * @class uRTC
 * @description An ultra-performant, zero-dependency WebRTC wrapper for P2P data & file synchronization. Multi-peer WebRTC wrapper for high-speed P2P sync and media.
 * @version 1.0.250
 * @author 1D
 * @copyright © 2026 Hold'inCorp. All rights reserved.
 * @license Apache-2.0
 * @updated 2026-03-09
 */
export class uRTC {
    constructor(apiKey) {
        this.apiKey = apiKey; // Ton ID Scaledrone
        this.drone = null;
        this.room = null;
        this.peers = {};
        this.localStream = null;

        // Configuration ICE standard
        this.config = {
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
        };

        // Callbacks publics
        this.onPeerConnect = (peerId) => {};
        this.onData = (peerId, data) => {};
        this.onStream = (peerId, stream) => {};
    }

    /**
     * Rejoindre une salle de manière automatique
     */
    join(roomName) {
        // @ts-ignore - Scaledrone est importé dans le HTML
        this.drone = new Scaledrone(this.apiKey);

        this.drone.on('open', error => {
            if (error) return console.error(error);
            this.room = this.drone.subscribe(`observable-${roomName}`);
            
            this.room.on('members', members => {
                // Si on est plusieurs, on initie la connexion avec les autres
                members.forEach(member => {
                    if (member.id !== this.drone.clientId) {
                        this._initPeer(member.id, true);
                    }
                });
            });

            this.room.on('data', (message, member) => {
                if (member.id === this.drone.clientId) return;
                this._handleSignaling(member.id, message);
            });
        });
    }

    async addStream(videoElementId) {
        this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (videoElementId) document.getElementById(videoElementId).srcObject = this.localStream;
        return this.localStream;
    }

    _initPeer(peerId, isOfferer) {
        const pc = new RTCPeerConnection(this.config);
        this.peers[peerId] = pc;

        if (this.localStream) {
            this.localStream.getTracks().forEach(t => pc.addTrack(t, this.localStream));
        }

        pc.onicecandidate = e => {
            if (e.candidate) this._sendSig(peerId, { candidate: e.candidate });
        };

        pc.ontrack = e => this.onStream(peerId, e.streams[0]);

        if (isOfferer) {
            pc.onnegotiationneeded = async () => {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                this._sendSig(peerId, { sdp: pc.localDescription });
            };
        }

        return pc;
    }

    async _handleSignaling(peerId, message) {
        if (!this.peers[peerId]) this._initPeer(peerId, false);
        const pc = this.peers[peerId];

        if (message.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
            if (pc.remoteDescription.type === 'offer') {
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                this._sendSig(peerId, { sdp: pc.localDescription });
            }
        } else if (message.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
        }
    }

    _sendSig(peerId, data) {
        this.drone.publish({ room: this.room.name, message: data });
    }
}
