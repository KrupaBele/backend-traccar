import { config } from '../config.js';

const lastSentMap = new Map();

const buildKey = ({ deviceId, metric, value }) =>
  `${deviceId || 'unknown'}|${metric || 'alert'}|${String(value || '')}`;

export const shouldSendAlert = ({ deviceId, metric, value }) => {
  const key = buildKey({ deviceId, metric, value });
  const now = Date.now();
  const last = lastSentMap.get(key);
  const cooldownMs = config.alerts.cooldownSeconds * 1000;

  if (last && now - last < cooldownMs) {
    return false;
  }

  lastSentMap.set(key, now);
  return true;
};
