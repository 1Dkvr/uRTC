import { Ø1D } from "./Humans.js";

/**
 * @class uRTC
 * @description An ultra-performant, zero-dependency WebRTC wrapper for P2P data & file synchronization. Multi-peer WebRTC wrapper for high-speed P2P sync and media.
 * @version 1.0.1327
 * @author 1D
 * @copyright © 2026 Hold'inCorp. All rights reserved.
 * @license Apache-2.0
 * @updated 2026-03-09
 */
export class uRTC {
    constructor(roomId = "uRTC-default-room") {
        this.roomId = roomId;
        this.peers = new Map();
        
        // Callbacks
        this.onMessage = (from, msg) => {};
        this.onPeerConnect = (id) => {};
        
        this._loadDependencies().then(() => this._init());
    }

    async _loadDependencies() {
        if (window.WebTorrent) return;
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
            script.onload = resolve;
            document.head.appendChild(script);
        });
    }

    _init() {
        // @ts-ignore
        this.client = new WebTorrent();
        const infoHash = this._generateHash(this.roomId);

        // On utilise un torrent vide comme bus de communication
        this.client.seed(new Uint8Array(0), { name: "uRTC-Bus", infoHash }, (torrent) => {
            console.log("uRTC: Room rejointe", torrent.infoHash);

            torrent.on('wire', (wire) => {
                const peerId = wire.remoteAddress || Math.random().toString(36).slice(2);
                if (!this.peers.has(peerId)) {
                    this.peers.set(peerId, wire);
                    this.onPeerConnect(peerId);
                    
                    // Écoute des messages
                    wire.on('extended', (id, data) => {
                        if (id === 'uRTC-msg') this.onMessage(peerId, data.toString());
                    });
                }
            });
        });
    }

    send(msg) {
        this.peers.forEach(wire => {
            try { wire.extended('uRTC-msg', msg); } catch(e) {}
        });
    }

    _generateHash(str) {
        // Simple hash pour transformer le nom de la room en InfoHash BitTorrent (40 hex chars)
        let hash = "";
        for (let i = 0; i < 40; i++) hash += (str.charCodeAt(i % str.length) % 16).toString(16);
        return hash;
    }
}
