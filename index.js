import { Ø1D } from "./Humans.js";
import { LocalBS } from "https://1dkvr.github.io/FrameKit/core/js/BrowserStorage.js";

/**
 * @class uRTC
 * @description Full Mesh Peer-to-Peer. End-to-End Encrypted (Native WebRTC)
 * @version 1.3.1623
 * @author 1D
 * @copyright © 2026 Hold'inCorp. All rights reserved.
 * @license Apache-2.0
 * @updated 2026-03-09
 */
export class uRTC {
    constructor(config = {}) {
        this.room = config.room || 'lobby';
        this.userId = this._getPersistentId();
        this.peers = {}; // Stockage des objets DataConnection
        this.storageKey = `uRTC_room_${this.room}`;
        
        // Callbacks pour l'intégration API
        this.onMessage = config.onMessage || (() => {});
        this.onStatusChange = config.onStatusChange || (() => {});
        
        this._initPeer();
    }

    /**
     * INITIALISATION DU NOEUD
     */
    _initPeer() {
        this.instance = new Peer(this.userId, {
            host: '0.peerjs.com',
            port: 443,
            secure: true,
            config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }] }
        });

        this.instance.on('open', (id) => {
            console.log(`[uRTC] Noeud actif: ${id}`);
            this._startDiscovery();
        });

        // Gestionnaire d'appels entrants (Serveur)
        this.instance.on('connection', (conn) => this._bindEvents(conn));
        
        this.instance.on('error', (err) => this._handleError(err));
    }

    /**
     * DÉCOUVERTE ET MAILLAGE AUTOMATIQUE
     */
    _startDiscovery() {
        const heartbeat = () => {
            let registry = LocalBS.get(this.storageKey) || {};
            registry[this.userId] = Date.now();

            // Nettoyage des noeuds fantômes (TTL 15s)
            for (let id in registry) {
                if (Date.now() - registry[id] > 15000) delete registry[id];
            }
            LocalBS.set(this.storageKey, registry);

            // Strategie de maillage: Le plus petit ID initie la connexion
            Object.keys(registry).forEach(targetId => {
                if (targetId !== this.userId && !this.peers[targetId]) {
                    if (this.userId < targetId) {
                        this.connect(targetId);
                    }
                }
            });
        };

        setInterval(heartbeat, 5000);
        heartbeat();
    }

    /**
     * LOGIQUE DE CONNEXION (Client)
     */
    connect(targetId) {
        if (this.peers[targetId]) return;
        const conn = this.instance.connect(targetId, { reliable: true });
        this._bindEvents(conn);
    }

    /**
     * BINDING DES ÉVÉNEMENTS DE FLUX
     */
    _bindEvents(conn) {
        conn.on('open', () => {
            this.peers[conn.peer] = conn;
            this.onStatusChange(this.getStats());
            console.log(`[uRTC] Canal sécurisé avec ${conn.peer}`);
        });

        conn.on('data', (data) => {
            // Ici, on reçoit un objet structuré
            this.onMessage(data, conn.peer);
        });

        conn.on('close', () => {
            delete this.peers[conn.peer];
            this.onStatusChange(this.getStats());
        });
    }

    /**
     * ENVOI MULTI-DESTINATAIRE (Broadcast)
     * Supporte: String, Object, ArrayBuffer, Blob
     */
    broadcast(payload, type = 'text') {
        const envelope = {
            type: type,
            payload: payload,
            timestamp: new Date().toISOString(),
            sender: this.userId
        };

        Object.values(this.peers).forEach(conn => {
            if (conn.open) conn.send(envelope);
        });
        
        return envelope;
    }

    /**
     * UTILITAIRES
     */
    _getPersistentId() {
        let id = LocalBS.get('uRTC_guid');
        if (!id) {
            id = 'dev_' + Math.random().toString(36).substring(2, 9);
            LocalBS.set('uRTC_guid', id);
        }
        return id;
    }

    _handleError(err) {
        if (err.type === 'peer-unavailable') {
            const ghostId = err.message.split(' ').pop();
            this._removeNodeFromRegistry(ghostId);
        }
        console.error(`[uRTC Error] ${err.type}`);
    }

    _removeNodeFromRegistry(id) {
        let db = LocalBS.get(this.storageKey) || {};
        delete db[id];
        LocalBS.set(this.storageKey, db);
    }

    getStats() {
        return {
            myId: this.userId,
            room: this.room,
            activeConnections: Object.keys(this.peers).length,
            nodes: Object.keys(this.peers)
        };
    }
}
