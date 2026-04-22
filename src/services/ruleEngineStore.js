const rulesMap = new Map();
const statusStateMap = new Map();
const speedStateMap = new Map();

const ruleKey = (rule) => `${rule.deviceId}|${rule.metric}`;

export const upsertRule = ({ deviceId, vehicleName, metric, limit = null, enabled = true }) => {
  const key = `${deviceId}|${metric}`;
  const now = new Date().toISOString();
  const existing = rulesMap.get(key);

  const next = {
    id: existing?.id || `${metric}-${deviceId}`,
    deviceId: Number(deviceId),
    vehicleName,
    metric,
    limit: limit == null ? null : Number(limit),
    enabled: Boolean(enabled),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  rulesMap.set(key, next);
  return next;
};

export const getRules = () => Array.from(rulesMap.values());

export const evaluateRules = (devices = []) => {
  const rules = getRules();
  if (rules.length === 0) return [];

  const events = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const device = devices.find(
      (entry) => Number(entry?.deviceId ?? entry?.id ?? -1) === Number(rule.deviceId)
    );
    if (!device) continue;

    if (rule.metric === 'speed' && rule.limit != null) {
      const key = ruleKey(rule);
      const speed = Number(device.speed ?? 0);
      const breached = speed > Number(rule.limit);
      const wasBreached = Boolean(speedStateMap.get(key));
      if (breached && !wasBreached) {
        events.push({
          deviceId: rule.deviceId,
          deviceName: rule.vehicleName || device.name || `Device ${rule.deviceId}`,
          metric: 'speed',
          value: speed.toFixed(0),
          message: `${rule.vehicleName || device.name || `Device ${rule.deviceId}`} crossed custom speed limit (${speed.toFixed(0)} > ${rule.limit} km/h)`,
          source: 'custom',
        });
      }
      speedStateMap.set(key, breached);
      continue;
    }

    if (rule.metric === 'device_offline' || rule.metric === 'device_online') {
      const key = ruleKey(rule);
      const currentStatus = String(device.status ?? '').toLowerCase() || 'unknown';
      const previousStatus = statusStateMap.get(key);
      const isTargetNow =
        (rule.metric === 'device_offline' && currentStatus === 'offline') ||
        (rule.metric === 'device_online' && currentStatus === 'online');
      const wasTargetBefore =
        (rule.metric === 'device_offline' && previousStatus === 'offline') ||
        (rule.metric === 'device_online' && previousStatus === 'online');

      if (isTargetNow && !wasTargetBefore && previousStatus != null) {
        const wentText = rule.metric === 'device_offline' ? 'went offline' : 'came online';
        events.push({
          deviceId: rule.deviceId,
          deviceName: rule.vehicleName || device.name || `Device ${rule.deviceId}`,
          metric: rule.metric,
          value: currentStatus,
          message: `${rule.vehicleName || device.name || `Device ${rule.deviceId}`} ${wentText} (custom rule)`,
          source: 'custom',
        });
      }

      statusStateMap.set(key, currentStatus);
    }
  }

  return events;
};
