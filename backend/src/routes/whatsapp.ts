/**
 * WhatsApp API Routes
 * Handles QR code generation, status checks, and message sending.
 */
import { Router, Request, Response } from 'express';
import QRCode from 'qrcode';
import { baileysService } from '../services/baileys';
import { renderTemplate, DEFAULT_TEMPLATE, TemplateVars } from '../utils/templates';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /api/whatsapp/status
 * Returns current WhatsApp connection status.
 */
router.get('/status', async (req: Request, res: Response) => {
  const status = baileysService.getStatus();
  let qrCodeDataUrl: string | null = null;

  if (status.qrCode) {
    try {
      qrCodeDataUrl = await QRCode.toDataURL(status.qrCode, { width: 300, margin: 2 });
    } catch (e) {
      logger.error({ error: e }, 'Failed to convert QR code to data URL');
    }
  }

  res.json({
    success: true,
    data: {
      ...status,
      qrCodeDataUrl,
    },
  });
});

/**
 * GET /api/whatsapp/qr
 * Returns the current QR code string and Data URL for pairing.
 */
router.get('/qr', async (req: Request, res: Response) => {
  const status = baileysService.getStatus();

  if (status.connected) {
    res.json({
      success: true,
      data: { qrCode: null, qrCodeDataUrl: null, connected: true, message: 'Already connected to WhatsApp' },
    });
    return;
  }

  const qrCode = baileysService.getQrCode();

  if (!qrCode) {
    res.json({
      success: true,
      data: {
        qrCode: null,
        qrCodeDataUrl: null,
        connected: false,
        message: 'QR code not yet available. Initializing connection...',
      },
    });
    return;
  }

  let qrCodeDataUrl: string | null = null;
  try {
    qrCodeDataUrl = await QRCode.toDataURL(qrCode, { width: 300, margin: 2 });
  } catch (e) {
    logger.error({ error: e }, 'Failed to generate QR data URL');
  }

  res.json({
    success: true,
    data: { qrCode, qrCodeDataUrl, connected: false },
  });
});

/**
 * POST /api/whatsapp/initialize
 * Starts the WhatsApp connection process with fresh QR code generation.
 */
router.post('/initialize', async (req: Request, res: Response) => {
  try {
    const status = baileysService.getStatus();
    if (status.connected) {
      res.json({
        success: true,
        data: { message: 'Already connected to WhatsApp' },
      });
      return;
    }

    // Force fresh QR code initialization
    baileysService.initialize(true).catch((err) => {
      logger.error({ error: err }, 'WhatsApp initialization failed');
    });

    res.json({
      success: true,
      data: { message: 'WhatsApp fresh initialization started. Poll /api/whatsapp/qr for QR code.' },
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to initialize WhatsApp');
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initialize WhatsApp',
    });
  }
});

/**
 * POST /api/whatsapp/pairing-code
 * Requests an 8-character WhatsApp pairing code for linking with a mobile phone number.
 * Open WhatsApp on phone -> Linked Devices -> Link with phone number instead -> Enter this code.
 */
router.post('/pairing-code', async (req: Request, res: Response) => {
  try {
    const rawPhoneNumber = req.body.phoneNumber ?? req.body.phone;
    logger.info({ rawPhoneNumber }, 'Incoming POST /api/whatsapp/pairing-code request');

    if (!rawPhoneNumber) {
      res.status(400).json({
        success: false,
        error: 'Phone number is required to request a pairing code.',
      });
      return;
    }

    const pairingCode = await baileysService.requestPairingCode(rawPhoneNumber);

    res.json({
      success: true,
      data: {
        pairingCode,
        message: 'Pairing code generated successfully. Enter this code on your phone in WhatsApp under Linked Devices -> Link with phone number instead.',
      },
    });
  } catch (error: any) {
    logger.error({ error, rawPhoneNumber: req.body.phoneNumber }, 'Failed to generate WhatsApp pairing code');
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to generate WhatsApp pairing code',
    });
  }
});

/**
 * POST /api/whatsapp/send
 * Sends a WhatsApp message to an individual or group.
 */
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { recipients, message, template, locationName } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      res.status(400).json({
        success: false,
        error: 'recipients array is required',
      });
      return;
    }

    if (!locationName && !message) {
      res.status(400).json({
        success: false,
        error: 'Either message or locationName is required',
      });
      return;
    }

    const templateStr = template || DEFAULT_TEMPLATE;
    const vars: TemplateVars = { location: locationName || 'Unknown Location' };
    const messageContent = message || renderTemplate(templateStr, vars);

    const results = [];
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      if (i > 0) {
        // Safe 1.5s delay between multiple recipients to prevent WhatsApp rate-limit / spam block
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      const targetPhone =
        typeof recipient === 'object' && recipient !== null
          ? (recipient.phone || recipient.phoneNumber || recipient.number)
          : recipient;
      const isGroup =
        typeof recipient === 'object' && recipient !== null
          ? Boolean(recipient.isGroup)
          : false;

      if (!targetPhone) {
        results.push({
          phone: '',
          isGroup,
          success: false,
          error: 'Missing phone number in recipient payload',
        });
        continue;
      }

      try {
        const result = await baileysService.sendMessage(
          targetPhone,
          messageContent,
          isGroup
        );
        results.push({
          phone: String(targetPhone),
          isGroup,
          ...result,
        });
      } catch (err: any) {
        logger.error({ error: err, recipient: targetPhone }, 'Error in recipient dispatch loop');
        results.push({
          phone: String(targetPhone),
          isGroup,
          success: false,
          error: err?.message || 'Failed to dispatch message',
        });
      }
    }

    const allSuccessful = results.length > 0 && results.every((r) => r.success);

    res.json({
      success: allSuccessful,
      data: {
        message: messageContent,
        results,
      },
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to send message');
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send message',
    });
  }
});

/**
 * POST /api/whatsapp/disconnect
 * Disconnects and clears the WhatsApp session.
 */
router.post('/disconnect', async (req: Request, res: Response) => {
  try {
    await baileysService.disconnect();
    res.json({
      success: true,
      data: { message: 'WhatsApp session disconnected and reset' },
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to disconnect WhatsApp');
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to disconnect',
    });
  }
});

export default router;
