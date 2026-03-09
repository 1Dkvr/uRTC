import { Ø1D } from "./Humans.js";
import { LocalBS } from "https://1dkvr.github.io/FrameKit/core/js/BrowserStorage.js";

/**
 * @class uRTC
 * @description An ultra-performant, zero-dependency WebRTC wrapper for P2P data & file synchronization. Multi-peer WebRTC wrapper for high-speed P2P sync and media.
 * @version 1.0.1430
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
        // Fréquence de rafraîchissement : 5 secondes
        setInterval(() => {
            // 1. On récupère la liste des peers
            let allPeers = LocalBS.get('uRTC_active_peers_' + this.room) || {};
            if (typeof allPeers === 'string') allPeers = JSON.parse(allPeers);
    
            const now = Date.now();
    
            // 2. On s'ajoute/met à jour
            allPeers[this.id] = now;
    
            // 3. NETTOYAGE STRICT : On vire tout ce qui n'a pas bougé depuis 15s
            for (let peerId in allPeers) {
                if (now - allPeers[peerId] > 15000) delete allPeers[peerId];
            }
    
            // 4. On sauvegarde
            LocalBS.set('uRTC_active_peers_' + this.room, allPeers);
    
            // 5. Tentative de connexion
            const otherId = Object.keys(allPeers).find(pid => pid !== this.id);
            
            if (otherId && !this.connections[otherId]) {
                // RÈGLE : Le plus "petit" ID appelle le plus "grand"
                // Ça garantit qu'une seule tentative a lieu à la fois
                if (this.id < otherId) {
                    console.log("uRTC: Tentative de liaison vers", otherId);
                    this.connect(otherId);
                }
            }
        }, 5000); // 5 secondes pour préserver les perfs
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
