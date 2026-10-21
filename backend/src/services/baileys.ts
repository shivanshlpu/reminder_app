/**
 * Baileys WhatsApp Service
 * Manages WhatsApp connection, QR code generation, session clearing, and message sending.
 */
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  ConnectionState,
  Browsers,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import logger from '../utils/logger';

export interface WhatsAppStatus {
  connected: boolean;
  qrCode: string | null;
  pairingCode: string | null;
  phoneNumber: string | null;
  lastConnected: string | null;
}

export interface SanitizedPhoneResult {
  valid: boolean;
  phoneNumber: string;
  error?: string;
}

/**
 * Robustly sanitizes and formats any phone number input to eliminate "wrong number type error".
 * Accepts string, number, or object representations.
 * Cleans non-digits, strips leading zeros, auto-prefixes Indian country code 91 if 10 digits.
 */
export function sanitizePhoneNumber(input: any): SanitizedPhoneResult {
  if (input === null || input === undefined) {
    return { valid: false, phoneNumber: '', error: 'Phone number is required.' };
  }

  // Handle object with phone property if passed accidentally
  let val = input;
  if (typeof input === 'object' && input !== null) {
    val = input.phoneNumber || input.phone || input.number || '';
  }

  let cleaned = String(val).trim();
  // Strip non-digit characters
  cleaned = cleaned.replace(/\D/g, '');

  // Strip leading trunk zeros e.g. 09876543210 -> 9876543210
  while (cleaned.startsWith('0')) {
    cleaned = cleaned.slice(1);
  }

  if (!cleaned) {
    return { valid: false, phoneNumber: '', error: 'Phone number cannot be empty or invalid characters.' };
  }

  // 10-digit Indian standard mobile number
  if (cleaned.length === 10) {
    cleaned = `91${cleaned}`;
  }

  // Valid international mobile numbers are between 10 and 15 digits (E.164)
  if (cleaned.length < 10 || cleaned.length > 15) {
    return {
      valid: false,
      phoneNumber: cleaned,
      error: `Invalid phone number length (${cleaned.length} digits). Please enter a valid 10-digit mobile number or full number with country code.`,
    };
  }

  return { valid: true, phoneNumber: cleaned };
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
    pairingCode: null,
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
        browser: Browsers.ubuntu('Chrome'),
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
          this.status.pairingCode = null;
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
          this.status.pairingCode = null;
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
   * Request an 8-character WhatsApp pairing code for linking with a phone number.
   * Completely validates and cleans phone number to avoid "wrong number type error".
   */
  async requestPairingCode(rawPhoneNumber: any): Promise<string> {
    const sanitized = sanitizePhoneNumber(rawPhoneNumber);
    if (!sanitized.valid) {
      throw new Error(sanitized.error || 'Invalid phone number format');
    }
    const cleanNumber = sanitized.phoneNumber;

    if (this.status.connected) {
      throw new Error(`Already connected to WhatsApp account: +${this.status.phoneNumber}`);
    }

    // Initialize socket if needed
    if (!this.sock) {
      await this.initialize(false);
    }

    // Wait for the WebSocket connection to be fully open
    let attempts = 0;
    while ((!this.sock || !(this.sock as any).ws?.isOpen) && attempts < 25) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      attempts++;
    }

    // If still not open, restart socket and wait
    if (!this.sock || !(this.sock as any).ws?.isOpen) {
      logger.info('WebSocket not open yet, forcing fresh connection for pairing code...');
      await this.initialize(true);
      let retry = 0;
      while ((!this.sock || !(this.sock as any).ws?.isOpen) && retry < 25) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        retry++;
      }
    }

    if (!this.sock) {
      throw new Error('Could not establish connection to WhatsApp gateway. Please verify your internet connection.');
    }

    try {
      logger.info(`Requesting WhatsApp pairing code for +${cleanNumber}...`);
      const rawCode = await this.sock.requestPairingCode(cleanNumber);

      // Format code as XXXX-XXXX (e.g. ABCD-1234 or 1234-5678)
      const formattedCode =
        rawCode && rawCode.length === 8
          ? `${rawCode.slice(0, 4)}-${rawCode.slice(4)}`
          : rawCode;

      this.status.pairingCode = formattedCode;
      this.notifyStatusListeners();
      logger.info(`WhatsApp pairing code generated successfully: ${formattedCode}`);

      return formattedCode;
    } catch (err: any) {
      logger.error({ error: err, cleanNumber }, 'Error requesting pairing code');
      throw new Error(err?.message || 'Failed to request pairing code from WhatsApp servers.');
    }
  }

  /**
   * Normalize and sanitize phone number into proper WhatsApp JID.
   * Handles any input type (string, number) safely and prevents "wrong number type error".
   */
  private normalizeRecipient(recipient: any, isGroup: boolean): string {
    if (!recipient && recipient !== 0) return '';
    const trimmed = String(recipient).trim();
    if (isGroup) {
      return trimmed.includes('@g.us') ? trimmed : `${trimmed.replace(/[^0-9\-@]/g, '')}@g.us`;
    }

    const sanitized = sanitizePhoneNumber(trimmed);
    if (!sanitized.valid) {
      return '';
    }

    return `${sanitized.phoneNumber}@s.whatsapp.net`;
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
      if (!jid) {
        return {
          success: false,
          error: 'Invalid recipient phone number or group ID.',
        };
      }

      let targetJid = jid;
      if (!isGroup) {
        try {
          const results = await this.sock.onWhatsApp(jid);
          if (results && results.length > 0 && results[0].exists && results[0].jid) {
            targetJid = results[0].jid;
          }
        } catch (e) {
          logger.warn({ error: e, jid }, 'onWhatsApp query notice — using normalized JID');
        }
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
      pairingCode: null,
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
