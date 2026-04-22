import express from 'express';
import { shouldSendAlert } from '../services/dedupeStore.js';
import { sendWhatsappMessage } from '../services/twilioService.js';
import { config } from '../config.js';

const router = express.Router();

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

  const body = [
    `Vehicle Alert (${source})`,
    `Device: ${deviceName}`,
    `Metric: ${metric}`,
    value != null ? `Value: ${value}` : null,
    `Message: ${message}`,
    `Time: ${new Date().toLocaleString()}`,
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
