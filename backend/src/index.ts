/**
 * Express Server Entry Point
 * Starts the Express server with WhatsApp integration and MongoDB Atlas Cloud Database.
 */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import healthRouter from './routes/health';
import whatsappRouter from './routes/whatsapp';
import exportRouter from './routes/export';
import dataRouter from './routes/data';
import { connectMongoDB } from './db/mongodb';
import { baileysService } from './services/baileys';
import logger from './utils/logger';

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  logger.debug({ method: req.method, url: req.url }, 'Incoming request');
  next();
});

// Routes
app.use('/api/health', healthRouter);
app.use('/api/whatsapp', whatsappRouter);
app.use('/api/export', exportRouter);
app.use('/api/data', dataRouter);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'PocketRadar WhatsApp & Data Backend with MongoDB Atlas',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      whatsapp: {
        status: 'GET /api/whatsapp/status',
        qr: 'GET /api/whatsapp/qr',
        initialize: 'POST /api/whatsapp/initialize',
        send: 'POST /api/whatsapp/send',
        disconnect: 'POST /api/whatsapp/disconnect',
      },
      export: {
        pdf: 'POST /api/export/pdf',
      },
      data: {
        expenses: '/api/data/expenses',
        locations: '/api/data/locations',
        contacts: '/api/data/contacts',
      },
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ error: err }, 'Unhandled error');
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Start server
app.listen(PORT, async () => {
  logger.info(`🚀 Server running on http://localhost:${PORT}`);

  // Connect to MongoDB Atlas
  await connectMongoDB();

  // Initialize WhatsApp connection
  try {
    await baileysService.initialize();
  } catch (error) {
    logger.error({ error }, 'Failed to auto-initialize WhatsApp on startup');
  }
});

export default app;
