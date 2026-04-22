import twilio from 'twilio';
import { config, hasTwilioConfig } from '../config.js';

let twilioClient = null;

const getClient = () => {
  if (!hasTwilioConfig) return null;
  if (!twilioClient) {
    twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
  }
  return twilioClient;
};

export const sendWhatsappMessage = async ({ to, body }) => {
  const client = getClient();
  if (!client) {
    throw new Error('Twilio config missing. Check .env values.');
  }

  return client.messages.create({
    from: config.twilio.whatsappFrom,
    to: to || config.twilio.defaultTo,
    body,
  });
};
