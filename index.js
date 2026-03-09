import { Ø1D } from "./Humans.js";
import { LocalBS } from "https://1dkvr.github.io/FrameKit/core/js/BrowserStorage.js";

/**
 * @class uRTC
 * @description An ultra-performant, zero-dependency WebRTC wrapper for P2P data & file synchronization. Multi-peer WebRTC wrapper for high-speed P2P sync and media.
 * @version 1.0.1423
 * @author 1D
 * @copyright © 2026 Hold'inCorp. All rights reserved.
 * @license Apache-2.0
 * @updated 2026-03-09
 */
export class uRTC {
    constructor(roomName = "default-room") {
        this.room = roomName.replace(/[^a-zA-Z0-9]/g, '');
        this.id = null;
        this.peer = null;
        this.connections = {};
        this.onConnected = () => {};
        this.onMessage = (m) => {};
        this._loadAndInit();
    }

    async _loadAndInit() {
        if (!window.Peer) {
            await new Promise(r => {
                const s = document.createElement('script');
                s.src = "https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js";
                s.onload = r; document.head.appendChild(s);
            });
        }
        this._startPeer();
    }

    _startPeer() {
        this.peer = new Peer();
        this.peer.on('open', (id) => {
            this.id = id;
            console.log("uRTC: Mon ID est " + id);
            // On attend 500ms pour laisser le serveur PeerJS souffler
            setTimeout(() => this._autoConnect(), 500);
        });

        this.peer.on('connection', (conn) => this._setupConn(conn));

        this.peer.on('error', (err) => {
            console.warn("uRTC Peer Error:", err.type);
            // Si le peer n'existe plus ou n'est pas prêt
            if (err.type === 'peer-unavailable' || err.type === 'webrtc') {
                console.log("uRTC: Conflit ou indisponible, nouvel essai dans 3s...");
                setTimeout(() => this._autoConnect(), 3000);
            }
        });
    }

    _autoConnect() {
        setInterval(() => {
            // On stocke l'ID actuel
            LocalBS.set('uRTC_last_peer_' + this.room, this.id);
            
            // On récupère la liste des peers actifs
            let allPeers = LocalBS.get('uRTC_active_peers_' + this.room);
            
            // Sécurité : si c'est une string, on parse, sinon on initialise
            if (typeof allPeers === 'string') allPeers = JSON.parse(allPeers);
            if (!allPeers || typeof allPeers !== 'object') allPeers = {};
    
            allPeers[this.id] = Date.now();
            
            // Nettoyage des peers inactifs
            for (let peerId in allPeers) {
                if (Date.now() - allPeers[peerId] > 5000) delete allPeers[peerId];
            }
    
            // On enregistre (LocalBS s'occupe probablement de la stringification selon sa config)
            LocalBS.set('uRTC_active_peers_' + this.room, allPeers);
    
            // Recherche du partenaire
            const otherId = Object.keys(allPeers).find(pid => pid !== this.id);
            
            if (otherId && !this.connections[otherId]) {
                if (this.id < otherId) {
                    console.log("uRTC: Connexion vers le peer FrameKit :", otherId);
                    this.connect(otherId);
                }
            }
        }, 1000);
    }

    connect(remoteId) {
        if (this.connections[remoteId]) return;
        const conn = this.peer.connect(remoteId, { 
            serialization: "json",
            reliable: true 
        });
        this._setupConn(conn);
    }

    _setupConn(conn) {
        conn.on('open', () => {
            if (this.connections[conn.peer]) return;
            this.connections[conn.peer] = conn;
            this.onConnected();
            console.log("uRTC: ✅ CONNECTÉ À " + conn.peer);
        });

        conn.on('data', (data) => this.onMessage(data));
        conn.on('close', () => delete this.connections[conn.peer]);
        conn.on('error', () => {});
    }

    send(msg) {
        Object.values(this.connections).forEach(conn => {
            if (conn.open) conn.send(msg);
        });
    }
}
