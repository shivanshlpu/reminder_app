/**
 * WhatsApp Backend API client.
 * Communicates with the Node.js backend for WhatsApp operations.
 */
import { Platform } from 'react-native';

function getInitialBackendUrl(): string {
  if (process.env.EXPO_PUBLIC_BACKEND_URL) {
    return process.env.EXPO_PUBLIC_BACKEND_URL;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const hostname = window.location.hostname || 'localhost';
    return `http://${hostname}:3001`;
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3001';
  }
  return 'http://localhost:3001';
}

export interface WhatsAppStatus {
  connected: boolean;
  qrCode: string | null;
  qrCodeDataUrl?: string | null;
  phoneNumber: string | null;
  lastConnected: string | null;
}

export interface SendResult {
  phone: string;
  isGroup: boolean;
  success: boolean;
  messageId?: string;
  error?: string;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

class WhatsAppApi {
  private baseUrl: string;

  constructor() {
    this.baseUrl = getInitialBackendUrl();
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });
      return await response.json();
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Network error — is the backend running?',
      };
    }
  }

  /**
   * Get WhatsApp connection status (including qrCodeDataUrl if pairing).
   */
  async getStatus(): Promise<WhatsAppStatus | null> {
    const response = await this.request<WhatsAppStatus>('/api/whatsapp/status');
    return response.data || null;
  }

  /**
   * Get the current QR code string and Data URL image for pairing.
   */
  async getQrCode(): Promise<{ qrCode: string | null; qrCodeDataUrl: string | null; connected?: boolean } | null> {
    const response = await this.request<{ qrCode: string | null; qrCodeDataUrl: string | null; connected?: boolean }>('/api/whatsapp/qr');
    return response.data || null;
  }

  /**
   * Initialize the WhatsApp connection.
   */
  async initialize(): Promise<boolean> {
    const response = await this.request('/api/whatsapp/initialize', {
      method: 'POST',
    });
    return response.success;
  }

  /**
   * Send a WhatsApp message.
   */
  async sendMessage(
    recipients: Array<{ phone: string; isGroup: boolean }>,
    locationName: string,
    template?: string,
    message?: string
  ): Promise<{ message: string; results: SendResult[] } | null> {
    const response = await this.request<{ message: string; results: SendResult[] }>(
      '/api/whatsapp/send',
      {
        method: 'POST',
        body: JSON.stringify({
          recipients,
          locationName,
          template,
          message,
        }),
      }
    );
    return response.data || null;
  }

  /**
   * Disconnect WhatsApp session.
   */
  async disconnect(): Promise<boolean> {
    const response = await this.request('/api/whatsapp/disconnect', {
      method: 'POST',
    });
    return response.success;
  }

  /**
   * Health check.
   */
  async healthCheck(): Promise<boolean> {
    const response = await this.request('/api/health');
    return response.success;
  }
}

export const whatsappApi = new WhatsAppApi();
export default whatsappApi;
