import dotenv from 'dotenv';

dotenv.config();

const parseList = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const parseNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  port: parseNumber(process.env.PORT, 4010),
  env: process.env.NODE_ENV || 'development',
  allowedOrigins: parseList(process.env.ALLOWED_ORIGINS),
  mongodbUri: process.env.MONGODB_URI || '',
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM || '',
    defaultTo: process.env.ALERT_WHATSAPP_TO || '',
  },
  auth: {
    jwtSecret:
      process.env.AUTH_JWT_SECRET || process.env.JWT_SECRET || 'change-me-in-production',
    jwtExpiresIn: process.env.AUTH_JWT_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '7d',
  },
  alerts: {
    cooldownSeconds: parseNumber(process.env.ALERT_COOLDOWN_SECONDS, 300),
  },
  traccar: {
    baseUrl: process.env.TRACCAR_BASE_URL || '',
    username: process.env.TRACCAR_USERNAME || '',
    password: process.env.TRACCAR_PASSWORD || '',
    pollingSeconds: parseNumber(process.env.TRACCAR_POLLING_SECONDS, 15),
  },
};

export const hasTwilioConfig = Boolean(
  config.twilio.accountSid &&
    config.twilio.authToken &&
    config.twilio.whatsappFrom &&
    config.twilio.defaultTo
);

export const hasAuthConfig = Boolean(config.auth.jwtSecret);

export const hasMongoConfig = Boolean(config.mongodbUri);
export const hasTraccarConfig = Boolean(
  config.traccar.baseUrl && config.traccar.username && config.traccar.password
);
