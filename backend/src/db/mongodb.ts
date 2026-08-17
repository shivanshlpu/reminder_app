/**
 * MongoDB Atlas Connection Manager using Mongoose
 */
import mongoose from 'mongoose';
import dns from 'dns';
import logger from '../utils/logger';

// Configure standard DNS resolvers to resolve MongoDB Atlas SRV records reliably on Windows
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {
  logger.warn('Could not set custom DNS servers');
}

export async function connectMongoDB(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    logger.warn('MONGODB_URI not provided in environment variables');
    return;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
    });
    logger.info(' Connected to MongoDB Atlas successfully!');
  } catch (error) {
    logger.error({ error }, '❌ Failed to connect to MongoDB Atlas');
  }
}

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  logger.error({ error: err }, 'MongoDB connection error');
});

export default mongoose;
