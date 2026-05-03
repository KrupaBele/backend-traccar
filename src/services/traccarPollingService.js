import { config, hasTraccarConfig } from '../config.js';
import { evaluateAndDispatchEvents } from './ruleEngineEvaluator.js';
import { getFuelStatesByDeviceIds, upsertFuelEntries, upsertFuelFromPositions } from './deviceFuelStore.js';

let pollingTimer = null;
let isRunning = false;
const REPORT_LOOKBACK_HOURS = 24;
const REPORT_FALLBACK_COOLDOWN_MS = 30 * 60 * 1000;
const lastReportFetchByDeviceId = new Map();

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

const asNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const fetchLatestFuelFromReport = async (deviceId) => {
  const to = new Date();
  const from = new Date(to.getTime() - REPORT_LOOKBACK_HOURS * 60 * 60 * 1000);
  const params = new URLSearchParams({
    deviceId: String(deviceId),
    from: from.toISOString(),
    to: to.toISOString(),
  });

  const response = await fetch(`${config.traccar.baseUrl}/reports/route?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: authHeader(),
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return null;
  }

  const rows = await response.json().catch(() => []);
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    const attrs = row?.attributes || {};
    const fuel = asNumber(attrs.fuel);
    const fuelLevel = asNumber(attrs.fuelLevel);
    if (fuel > 0 || fuelLevel > 0) {
      return {
        deviceId,
        fuel: fuel > 0 ? fuel : fuelLevel,
        fuelLevel: fuelLevel > 0 ? fuelLevel : fuel,
        fixTime: row?.fixTime || null,
      };
    }
  }

  return null;
};

const backfillFuelFromReportIfMissing = async (positions = []) => {
  const nowMs = Date.now();
  const deviceIds = Array.from(
    new Set(
      positions
        .map((position) => Number(position?.deviceId))
        .filter((deviceId) => Number.isFinite(deviceId) && deviceId > 0)
    )
  );

  if (deviceIds.length === 0) {
    return;
  }

  const knownStates = await getFuelStatesByDeviceIds(deviceIds);
  const knownByDeviceId = new Map(knownStates.map((item) => [item.deviceId, item]));
  const candidates = deviceIds.filter((deviceId) => {
    const known = knownByDeviceId.get(deviceId);
    if (known && (known.fuel > 0 || known.fuelLevel > 0)) {
      return false;
    }
    const lastAttempt = Number(lastReportFetchByDeviceId.get(deviceId) || 0);
    return nowMs - lastAttempt >= REPORT_FALLBACK_COOLDOWN_MS;
  });

  if (candidates.length === 0) {
    return;
  }

  const backfilledEntries = [];
  for (const deviceId of candidates) {
    lastReportFetchByDeviceId.set(deviceId, nowMs);
    const entry = await fetchLatestFuelFromReport(deviceId);
    if (entry) {
      backfilledEntries.push(entry);
    }
  }

  if (backfilledEntries.length > 0) {
    await upsertFuelEntries(backfilledEntries);
  }
};

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
    await upsertFuelFromPositions(positions);
    await backfillFuelFromReportIfMissing(positions);
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
