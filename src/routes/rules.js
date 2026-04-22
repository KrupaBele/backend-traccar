import express from 'express';
import { RuleModel } from '../models/Rule.js';
import { RuleEventModel } from '../models/RuleEvent.js';
import { evaluateAndDispatchEvents } from '../services/ruleEngineEvaluator.js';

const router = express.Router();

router.get('/', async (_req, res) => {
  const rules = await RuleModel.find({}).sort({ updatedAt: -1 }).lean();
  res.status(200).json({ success: true, rules });
});

router.get('/events', async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const deviceId = req.query.deviceId ? Number(req.query.deviceId) : null;
  const filter = Number.isFinite(deviceId) ? { deviceId } : {};
  const events = await RuleEventModel.find(filter).sort({ eventTime: -1 }).limit(limit).lean();
  res.status(200).json({ success: true, events });
});

router.post('/upsert', async (req, res) => {
  const { deviceId, vehicleName, metric, limit = null, enabled = true } = req.body || {};
  if (!deviceId || !vehicleName || !metric) {
    return res.status(400).json({
      success: false,
      error: 'deviceId, vehicleName and metric are required',
    });
  }

  const allowedMetrics = ['speed', 'device_offline', 'device_online'];
  if (!allowedMetrics.includes(metric)) {
    return res.status(400).json({ success: false, error: 'Unsupported metric' });
  }

  const rule = await RuleModel.findOneAndUpdate(
    { deviceId: Number(deviceId), metric },
    {
      $set: {
        vehicleName,
        metric,
        limit: limit == null ? null : Number(limit),
        enabled: Boolean(enabled),
      },
      $setOnInsert: {
        deviceId: Number(deviceId),
      },
    },
    { new: true, upsert: true }
  ).lean();

  return res.status(200).json({ success: true, rule });
});

router.post('/evaluate', async (req, res) => {
  const devices = Array.isArray(req.body?.devices) ? req.body.devices : null;
  if (!devices) {
    return res.status(400).json({ success: false, error: 'devices array is required' });
  }
  const { evaluated, sent, skipped } = await evaluateAndDispatchEvents(devices);

  return res.status(200).json({
    success: true,
    evaluated,
    sent,
    skipped,
  });
});

export default router;
