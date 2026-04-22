import { config, hasTraccarConfig } from '../config.js';
import { evaluateAndDispatchEvents } from './ruleEngineEvaluator.js';

let pollingTimer = null;
let isRunning = false;

const authHeader = () => {
  const encoded = Buffer.from(
    `${config.traccar.username}:${config.traccar.password}`,
    'utf-8'
  ).toString('base64');
  return `Basic ${encoded}`;
};

const normalizeTraccarDevice = (device, speedByDeviceId) => ({
  deviceId: Number(device?.id ?? -1),
  id: Number(device?.id ?? -1),
  name: device?.name ?? '',
  status: String(device?.status ?? '').toLowerCase(),
  speed: Number(speedByDeviceId.get(Number(device?.id ?? -1)) ?? 0),
  lastUpdate: device?.lastUpdate ?? null,
  deviceTime: device?.lastUpdate ?? null,
  serverTime: device?.lastUpdate ?? null,
});

const pollOnce = async () => {
  if (isRunning) return;
  isRunning = true;
  try {
    if (!hasTraccarConfig) return;
    const [deviceResp, positionResp] = await Promise.all([
      fetch(`${config.traccar.baseUrl}/devices`, {
        method: 'GET',
        headers: {
          Authorization: authHeader(),
          Accept: 'application/json',
        },
      }),
      fetch(`${config.traccar.baseUrl}/positions`, {
        method: 'GET',
        headers: {
          Authorization: authHeader(),
          Accept: 'application/json',
        },
      }),
    ]);

    if (!deviceResp.ok) {
      const text = await deviceResp.text().catch(() => '');
      throw new Error(
        `Traccar device poll failed (${deviceResp.status}): ${text || deviceResp.statusText}`
      );
    }
    if (!positionResp.ok) {
      const text = await positionResp.text().catch(() => '');
      throw new Error(
        `Traccar position poll failed (${positionResp.status}): ${text || positionResp.statusText}`
      );
    }

    const [deviceData, positionData] = await Promise.all([
      deviceResp.json(),
      positionResp.json(),
    ]);
    const positions = Array.isArray(positionData) ? positionData : [];
    const speedByDeviceId = new Map(
      positions.map((p) => [Number(p?.deviceId ?? -1), Number(p?.speed ?? 0)])
    );
    const devices = Array.isArray(deviceData)
      ? deviceData.map((device) => normalizeTraccarDevice(device, speedByDeviceId))
      : [];
    const result = await evaluateAndDispatchEvents(devices);
    if (result.sent.length > 0 || result.skipped.length > 0) {
      console.info('[rule-engine] polled', {
        evaluated: result.evaluated,
        sent: result.sent.length,
        skipped: result.skipped.length,
      });
    }
  } catch (error) {
    console.error('[rule-engine] polling error', error?.message || error);
  } finally {
    isRunning = false;
  }
};

export const startTraccarPolling = () => {
  if (!hasTraccarConfig) {
    console.warn(
      '[rule-engine] Traccar polling disabled. Set TRACCAR_BASE_URL/TRACCAR_USERNAME/TRACCAR_PASSWORD.'
    );
    return;
  }
  if (pollingTimer) return;
  const intervalMs = Math.max(5000, Number(config.traccar.pollingSeconds || 15) * 1000);
  void pollOnce();
  pollingTimer = setInterval(() => void pollOnce(), intervalMs);
  console.log(`[rule-engine] autonomous polling enabled every ${Math.round(intervalMs / 1000)}s`);
};
