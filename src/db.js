import mongoose from 'mongoose';
import { config, hasMongoConfig } from './config.js';

export const connectDatabase = async () => {
  if (!hasMongoConfig) {
    throw new Error('MONGODB_URI is required for server-side rule engine persistence.');
  }
  await mongoose.connect(config.mongodbUri);
};
