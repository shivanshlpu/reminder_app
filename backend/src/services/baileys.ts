/**
 * Baileys WhatsApp Service
 * Manages WhatsApp connection, QR code generation, session clearing, and message sending.
 */
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  ConnectionState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import logger from '../utils/logger';

export interface WhatsAppStatus {
  connected: boolean;
  qrCode: string | null;
  phoneNumber: string | null;
  lastConnected: string | null;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
  resolvedJid?: string;
}

class BaileysService {
  private sock: WASocket | null = null;
  private status: WhatsAppStatus = {
    connected: false,
    qrCode: null,
    phoneNumber: null,
    lastConnected: null,
  };
  private authDir: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isInitializing = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private qrListeners: Array<(qr: string) => void> = [];
  private statusListeners: Array<(status: WhatsAppStatus) => void> = [];

  constructor() {
    this.authDir = process.env.WHATSAPP_AUTH_DIR || path.join(process.cwd(), 'auth_info');
  }

  private clearAuthFolder() {
    try {
      if (fs.existsSync(this.authDir)) {
        fs.rmSync(this.authDir, { recursive: true, force: true });
        logger.info('Cleared WhatsApp auth_info directory');
      }
    } catch (err) {
      logger.error({ error: err }, 'Failed to clear auth_info directory');
    }
  }

  /**
   * Initialize or re-initialize the WhatsApp connection.
   */
  async initialize(forceFresh: boolean = false): Promise<void> {
    if (this.isInitializing) {
      logger.info('WhatsApp initialization is already active');
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.isInitializing = true;

    if (forceFresh) {
      this.reconnectAttempts = 0;
      if (this.sock) {
        try {
          this.sock.ev.removeAllListeners('connection.update');
          this.sock.ev.removeAllListeners('creds.update');
          this.sock.end(undefined);
        } catch (e) {}
        this.sock = null;
      }
      this.clearAuthFolder();
    }

    try {
      if (!fs.existsSync(this.authDir)) {
        fs.mkdirSync(this.authDir, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

      if (this.sock) {
        try {
          this.sock.ev.removeAllListeners('connection.update');
          this.sock.ev.removeAllListeners('creds.update');
          this.sock.end(undefined);
        } catch (e) {}
        this.sock = null;
      }

      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }) as any,
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        connectTimeoutMs: 60000,
        qrTimeout: 60000,
        defaultQueryTimeoutMs: 60000,
      });

      this.sock.ev.on('connection.update', (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.status.qrCode = qr;
          logger.info('QR code received — scan with WhatsApp');
          this.notifyQrListeners(qr);
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;

          this.status.connected = false;
          this.status.qrCode = null;
          this.notifyStatusListeners();
          this.isInitializing = false;

          if (isLoggedOut) {
            logger.info('Logged out from WhatsApp. Session cleared.');
            this.clearAuthFolder();
            this.reconnectAttempts = 0;
          } else {
            this.reconnectAttempts++;
            const backoffDelay = Math.min(30000, 3000 * Math.pow(1.5, Math.min(this.reconnectAttempts, 6)));
            logger.info(`Reconnecting to WhatsApp in ${Math.round(backoffDelay / 1000)}s... attempt #${this.reconnectAttempts}`);
            this.reconnectTimer = setTimeout(() => {
              this.initialize(false);
            }, backoffDelay);
          }
        } else if (connection === 'open') {
          this.status.connected = true;
          this.status.qrCode = null;
          this.status.lastConnected = new Date().toISOString();
          this.reconnectAttempts = 0;
          this.isInitializing = false;

          if (this.sock?.user) {
            this.status.phoneNumber = this.sock.user.id.split(':')[0] || null;
          }

          logger.info(`WhatsApp connected successfully! Account: +${this.status.phoneNumber}`);
          this.notifyStatusListeners();
        }
      });

      this.sock.ev.on('creds.update', saveCreds);
      this.isInitializing = false;
    } catch (error) {
      this.isInitializing = false;
      logger.error({ error }, 'Failed to initialize WhatsApp connection');
      throw error;
    }
  }

  /**
   * Normalize and sanitize phone number into proper WhatsApp JID.
   */
  private normalizeRecipient(recipient: string, isGroup: boolean): string {
    if (isGroup) {
      return recipient.includes('@g.us') ? recipient : `${recipient}@g.us`;
    }

    let clean = recipient.replace(/\D/g, '');

    // If 10 digits (standard Indian number without country code), prepend 91
    if (clean.length === 10) {
      clean = `91${clean}`;
    }

    clean = clean.replace(/^0+/, '');

    return clean.includes('@s.whatsapp.net') ? clean : `${clean}@s.whatsapp.net`;
  }

  /**
   * Send a text message to an individual or group.
   */
  async sendMessage(
    recipient: string,
    message: string,
    isGroup: boolean = false
  ): Promise<SendMessageResult> {
    if (!this.sock || !this.status.connected) {
      return {
        success: false,
        error: 'WhatsApp is not connected. Please scan the QR code in Settings first.',
      };
    }

    try {
      const jid = this.normalizeRecipient(recipient, isGroup);

      let targetJid = jid;
      if (!isGroup) {
        try {
          const results = await this.sock.onWhatsApp(jid);
          if (results && results.length > 0 && results[0].exists) {
            targetJid = results[0].jid;
          }
        } catch (e) {}
      }

      const sendResult = await this.sock.sendMessage(targetJid, { text: message });

      logger.info({ recipient: targetJid, messageId: sendResult?.key?.id }, 'WhatsApp message delivered successfully');

      return {
        success: true,
        messageId: sendResult?.key?.id || undefined,
        resolvedJid: targetJid,
      };
    } catch (error: any) {
      logger.error({ error, recipient }, 'Failed to send WhatsApp message');
      return {
        success: false,
        error: error.message || 'Failed to send message',
      };
    }
  }

  /**
   * Disconnect and clear session.
   */
  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners('connection.update');
        this.sock.ev.removeAllListeners('creds.update');
        await this.sock.logout();
      } catch (e) {}
      this.sock = null;
    }
    this.clearAuthFolder();
    this.status = {
      connected: false,
      qrCode: null,
      phoneNumber: null,
      lastConnected: null,
    };
    this.reconnectAttempts = 0;
    this.isInitializing = false;
    this.notifyStatusListeners();
    logger.info('WhatsApp session disconnected and cleared');
  }

  getStatus(): WhatsAppStatus {
    return { ...this.status };
  }

  getQrCode(): string | null {
    return this.status.qrCode;
  }

  onQrCode(listener: (qr: string) => void): void {
    this.qrListeners.push(listener);
  }

  onStatusChange(listener: (status: WhatsAppStatus) => void): void {
    this.statusListeners.push(listener);
  }

  private notifyQrListeners(qr: string): void {
    this.qrListeners.forEach((listener) => listener(qr));
  }

  private notifyStatusListeners(): void {
    const status = this.getStatus();
    this.statusListeners.forEach((listener) => listener(status));
  }
}

export const baileysService = new BaileysService();
export default baileysService;
