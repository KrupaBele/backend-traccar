import express from 'express';
import { shouldSendAlert } from '../services/dedupeStore.js';
import { sendWhatsappMessage } from '../services/twilioService.js';
import { config } from '../config.js';

const router = express.Router();
const formatUtc = (date) => date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
const formatIst = (date) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
    .format(date)
    .replace(',', '') + ' IST';

const validatePayload = (payload) => {
  if (!payload || typeof payload !== 'object') return 'Body is required';
  if (!payload.deviceName) return 'deviceName is required';
  if (!payload.metric) return 'metric is required';
  if (!payload.message) return 'message is required';
  return null;
};

router.post('/send', async (req, res) => {
  const validationError = validatePayload(req.body);
  if (validationError) {
    return res.status(400).json({ success: false, error: validationError });
  }

  const {
    deviceId = null,
    deviceName,
    metric,
    value = null,
    message,
    to = config.twilio.defaultTo,
    source = 'custom',
  } = req.body;

  const shouldSend = shouldSendAlert({ deviceId, metric, value });
  if (!shouldSend) {
    return res.status(200).json({
      success: true,
      skipped: true,
      reason: 'Cooldown active. Duplicate alert suppressed.',
    });
  }

  const sentTime = new Date();
  const body = [
    `Vehicle Alert (${source})`,
    `Device: ${deviceName}`,
    `Metric: ${metric}`,
    value != null ? `Value: ${value}` : null,
    `Message: ${message}`,
    `Sent Time (IST): ${formatIst(sentTime)}`,
    `Sent Time (UTC): ${formatUtc(sentTime)}`,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const result = await sendWhatsappMessage({ to, body });
    return res.status(200).json({
      success: true,
      sid: result.sid,
      status: result.status,
      to: result.to,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to send WhatsApp message',
    });
  }
});

export default router;
