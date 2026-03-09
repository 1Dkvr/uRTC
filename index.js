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
    constructor() {
        // @ts-ignore (PeerJS importé via CDN dans le HTML)
        this.peer = new Peer({
            config: { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] }
        });

        this.connections = {};
        this.localStream = null;

        // Callbacks
        this.onID = (id) => {}; 
        this.onPeerConnect = (conn) => {};
        this.onStream = (stream, id) => {};
        this.onData = (data, id) => {};

        this._setupPeer();
    }

    _setupPeer() {
        this.peer.on('open', id => this.onID(id));
        
        // Quand quelqu'un nous appelle (Data)
        this.peer.on('connection', conn => this._bindConn(conn));
        
        // Quand quelqu'un nous appelle (Vidéo/Audio)
        this.peer.on('call', call => {
            call.answer(this.localStream);
            call.on('stream', stream => this.onStream(stream, call.peer));
        });
    }

    /**
     * Se connecter à un autre appareil via son ID
     */
    connect(remoteId) {
        const conn = this.peer.connect(remoteId);
        this._bindConn(conn);

        if (this.localStream) {
            const call = this.peer.call(remoteId, this.localStream);
            call.on('stream', stream => this.onStream(stream, remoteId));
        }
    }

    async addStream() {
        this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        return this.localStream;
    }

    _bindConn(conn) {
        this.connections[conn.peer] = conn;
        conn.on('open', () => this.onPeerConnect(conn));
        conn.on('data', data => this.onData(data, conn.peer));
    }

    broadcast(data) {
        Object.values(this.connections).forEach(c => c.send(data));
    }
}
