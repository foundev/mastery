import type { SyncData } from './types';
import { syncManager } from './sync';
import { getInstanceId } from './storage';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'failed';
export type PeerRole = 'initiator' | 'responder';

export interface PeerConnection {
  state: ConnectionState;
  role: PeerRole | null;
  peerId: string | null;
}

interface SyncMessage {
  type: 'sync-request' | 'sync-response' | 'sync-push';
  data: SyncData;
  timestamp: number;
}

/**
 * WebRTCManager handles peer-to-peer connections for data synchronization
 * Uses manual signaling (copy/paste codes) for serverless operation
 */
export class WebRTCManager {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private role: PeerRole | null = null;
  private peerId: string | null = null;

  // Callbacks
  private onStateChange?: (state: ConnectionState) => void;
  private onSyncReceived?: (data: SyncData) => void;
  private onError?: (error: string) => void;

  // Free public STUN servers for NAT traversal
  private readonly iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ];

  constructor() {
    this.updateState('disconnected');
  }

  /**
   * Set callback for connection state changes
   */
  setOnStateChange(callback: (state: ConnectionState) => void): void {
    this.onStateChange = callback;
  }

  /**
   * Set callback for receiving sync data
   */
  setOnSyncReceived(callback: (data: SyncData) => void): void {
    this.onSyncReceived = callback;
  }

  /**
   * Set callback for errors
   */
  setOnError(callback: (error: string) => void): void {
    this.onError = callback;
  }

  /**
   * Create a new offer (initiator side)
   * Returns a connection code to share with the other peer
   */
  async createOffer(): Promise<string> {
    this.cleanup();
    this.role = 'initiator';
    this.updateState('connecting');

    try {
      // Create peer connection
      this.pc = new RTCPeerConnection({ iceServers: this.iceServers });
      this.setupPeerConnection();

      // Create data channel
      this.dataChannel = this.pc.createDataChannel('sync', {
        ordered: true,
        maxRetransmits: 3
      });
      this.setupDataChannel();

      // Create offer
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      // Wait for ICE gathering to complete
      await this.waitForIceGathering();

      // Encode offer as base64 connection code
      const offerData = {
        type: 'offer',
        sdp: this.pc.localDescription?.sdp,
        instanceId: getInstanceId()
      };

      return this.encodeConnectionCode(offerData);
    } catch (error) {
      this.handleError(`Failed to create offer: ${error}`);
      throw error;
    }
  }

  /**
   * Create an answer to a received offer (responder side)
   * Returns an answer code to send back to the initiator
   */
  async createAnswer(offerCode: string): Promise<string> {
    this.cleanup();
    this.role = 'responder';
    this.updateState('connecting');

    try {
      // Decode offer
      const offerData = this.decodeConnectionCode(offerCode);
      if (offerData.type !== 'offer') {
        throw new Error('Invalid offer code');
      }

      this.peerId = offerData.instanceId;

      // Create peer connection
      this.pc = new RTCPeerConnection({ iceServers: this.iceServers });
      this.setupPeerConnection();

      // Set remote description (offer)
      await this.pc.setRemoteDescription({
        type: 'offer',
        sdp: offerData.sdp
      });

      // Create answer
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      // Wait for ICE gathering
      await this.waitForIceGathering();

      // Encode answer as base64 connection code
      const answerData = {
        type: 'answer',
        sdp: this.pc.localDescription?.sdp,
        instanceId: getInstanceId()
      };

      return this.encodeConnectionCode(answerData);
    } catch (error) {
      this.handleError(`Failed to create answer: ${error}`);
      throw error;
    }
  }

  /**
   * Complete connection by applying received answer (initiator side)
   */
  async applyAnswer(answerCode: string): Promise<void> {
    if (!this.pc || this.role !== 'initiator') {
      throw new Error('No active offer to apply answer to');
    }

    try {
      // Decode answer
      const answerData = this.decodeConnectionCode(answerCode);
      if (answerData.type !== 'answer') {
        throw new Error('Invalid answer code');
      }

      this.peerId = answerData.instanceId;

      // Set remote description (answer)
      await this.pc.setRemoteDescription({
        type: 'answer',
        sdp: answerData.sdp
      });
    } catch (error) {
      this.handleError(`Failed to apply answer: ${error}`);
      throw error;
    }
  }

  /**
   * Send sync data to connected peer
   */
  sendSyncData(data: SyncData): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('Data channel not open');
    }

    const message: SyncMessage = {
      type: 'sync-push',
      data,
      timestamp: Date.now()
    };

    this.dataChannel.send(JSON.stringify(message));
  }

  /**
   * Request sync from connected peer
   */
  requestSync(localData: SyncData): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('Data channel not open');
    }

    const message: SyncMessage = {
      type: 'sync-request',
      data: localData,
      timestamp: Date.now()
    };

    this.dataChannel.send(JSON.stringify(message));
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    this.cleanup();
    this.updateState('disconnected');
  }

  /**
   * Setup peer connection event handlers
   */
  private setupPeerConnection(): void {
    if (!this.pc) return;

    this.pc.oniceconnectionstatechange = () => {
      if (!this.pc) return;

      switch (this.pc.iceConnectionState) {
        case 'connected':
        case 'completed':
          this.updateState('connected');
          break;
        case 'failed':
        case 'closed':
          this.updateState('failed');
          break;
        case 'disconnected':
          this.updateState('disconnected');
          break;
      }
    };

    // For responder: data channel comes from remote
    this.pc.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.setupDataChannel();
    };
  }

  /**
   * Setup data channel event handlers
   */
  private setupDataChannel(): void {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      console.log('Data channel opened');
      this.updateState('connected');
    };

    this.dataChannel.onclose = () => {
      console.log('Data channel closed');
      this.updateState('disconnected');
    };

    this.dataChannel.onerror = (error) => {
      console.error('Data channel error:', error);
      this.handleError('Data channel error');
    };

    this.dataChannel.onmessage = (event) => {
      try {
        const message: SyncMessage = JSON.parse(event.data);
        this.handleSyncMessage(message);
      } catch (error) {
        console.error('Failed to parse sync message:', error);
      }
    };
  }

  /**
   * Handle received sync messages
   */
  private handleSyncMessage(message: SyncMessage): void {
    switch (message.type) {
      case 'sync-request':
      case 'sync-push':
        // Notify callback with received sync data
        if (this.onSyncReceived) {
          this.onSyncReceived(message.data);
        }
        break;

      case 'sync-response':
        if (this.onSyncReceived) {
          this.onSyncReceived(message.data);
        }
        break;
    }
  }

  /**
   * Wait for ICE candidate gathering to complete
   */
  private waitForIceGathering(): Promise<void> {
    if (!this.pc) return Promise.reject('No peer connection');

    return new Promise((resolve) => {
      if (this.pc!.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      const checkState = () => {
        if (this.pc!.iceGatheringState === 'complete') {
          this.pc!.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };

      this.pc.addEventListener('icegatheringstatechange', checkState);

      // Fallback timeout
      setTimeout(() => {
        if (this.pc) {
          this.pc.removeEventListener('icegatheringstatechange', checkState);
        }
        resolve();
      }, 5000);
    });
  }

  /**
   * Encode connection data as base64 string
   */
  private encodeConnectionCode(data: any): string {
    const json = JSON.stringify(data);
    return btoa(json);
  }

  /**
   * Decode base64 connection code
   */
  private decodeConnectionCode(code: string): any {
    try {
      const json = atob(code);
      return JSON.parse(json);
    } catch (error) {
      throw new Error('Invalid connection code');
    }
  }

  /**
   * Update connection state and notify callback
   */
  private updateState(state: ConnectionState): void {
    this.connectionState = state;
    if (this.onStateChange) {
      this.onStateChange(state);
    }
  }

  /**
   * Handle errors
   */
  private handleError(message: string): void {
    console.error(message);
    if (this.onError) {
      this.onError(message);
    }
    this.updateState('failed');
  }

  /**
   * Cleanup connections
   */
  private cleanup(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    this.role = null;
    this.peerId = null;
  }
}

// Export singleton instance
export const webrtcManager = new WebRTCManager();
