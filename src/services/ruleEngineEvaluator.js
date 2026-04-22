import { shouldSendAlert } from './dedupeStore.js';
import { sendWhatsappMessage } from './twilioService.js';
import { config } from '../config.js';
import { RuleModel } from '../models/Rule.js';
import { DeviceRuleStateModel } from '../models/DeviceRuleState.js';
import { RuleEventModel } from '../models/RuleEvent.js';

const getRuleKey = (rule) => `${rule.deviceId}|${rule.metric}`;
const getSnapshotTime = (device) => {
  const raw = device.lastUpdate || device.deviceTime || device.serverTime;
  return raw ? new Date(raw) : new Date();
};

export const evaluateAndDispatchEvents = async (devices = []) => {
  const rules = await RuleModel.find({ enabled: true }).lean();
  const states = await DeviceRuleStateModel.find({}).lean();
  const stateMap = new Map(states.map((item) => [item.ruleKey, item]));
  const events = [];

  for (const rule of rules) {
    const device = devices.find(
      (entry) => Number(entry?.deviceId ?? entry?.id ?? -1) === Number(rule.deviceId)
    );
    if (!device) continue;

    const ruleKey = getRuleKey(rule);
    const previousState = stateMap.get(ruleKey);

    if (rule.metric === 'speed' && rule.limit != null) {
      const speed = Number(device.speed ?? 0);
      const breached = speed > Number(rule.limit);
      const wasBreached = Boolean(previousState?.speedBreached);
      if (breached && !wasBreached) {
        events.push({
          deviceId: rule.deviceId,
          deviceName: rule.vehicleName || device.name || `Device ${rule.deviceId}`,
          metric: 'speed',
          value: speed.toFixed(0),
          message: `${rule.vehicleName || device.name || `Device ${rule.deviceId}`} crossed custom speed limit (${speed.toFixed(0)} > ${rule.limit} km/h)`,
          source: 'custom',
          eventTime: getSnapshotTime(device),
        });
      }

      await DeviceRuleStateModel.updateOne(
        { ruleKey },
        {
          $set: {
            deviceId: rule.deviceId,
            metric: rule.metric,
            speedBreached: breached,
          },
        },
        { upsert: true }
      );
      continue;
    }

    if (rule.metric === 'device_offline' || rule.metric === 'device_online') {
      const currentStatus = String(device.status ?? '').toLowerCase() || 'unknown';
      const previousStatus = previousState?.statusValue ?? null;
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
          eventTime: getSnapshotTime(device),
        });
      }

      await DeviceRuleStateModel.updateOne(
        { ruleKey },
        {
          $set: {
            deviceId: rule.deviceId,
            metric: rule.metric,
            statusValue: currentStatus,
          },
        },
        { upsert: true }
      );
    }
  }

  const sent = [];
  const skipped = [];

  for (const event of events) {
    const canSend = shouldSendAlert({
      deviceId: event.deviceId,
      metric: event.metric,
      value: event.value,
    });
    if (!canSend) {
      skipped.push({ ...event, reason: 'Cooldown active' });
      continue;
    }

    const body = [
      `Vehicle Alert (${event.source})`,
      `Device: ${event.deviceName}`,
      `Metric: ${event.metric}`,
      event.value != null ? `Value: ${event.value}` : null,
      `Message: ${event.message}`,
      `Time: ${new Date().toLocaleString()}`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const result = await sendWhatsappMessage({
        to: config.twilio.defaultTo,
        body,
      });
      await RuleEventModel.create({
        deviceId: event.deviceId,
        deviceName: event.deviceName,
        metric: event.metric,
        value: event.value == null ? null : String(event.value),
        message: event.message,
        source: event.source,
        eventTime: event.eventTime || new Date(),
        whatsappSid: result.sid,
        whatsappStatus: result.status,
      });
      sent.push({
        metric: event.metric,
        deviceId: event.deviceId,
        sid: result.sid,
        status: result.status,
      });
    } catch (error) {
      skipped.push({
        ...event,
        reason: error?.message || 'Failed to send WhatsApp message',
      });
      await RuleEventModel.create({
        deviceId: event.deviceId,
        deviceName: event.deviceName,
        metric: event.metric,
        value: event.value == null ? null : String(event.value),
        message: event.message,
        source: event.source,
        eventTime: event.eventTime || new Date(),
        deliverySkippedReason: error?.message || 'Failed to send WhatsApp message',
      });
    }
  }

  return {
    evaluated: events.length,
    sent,
    skipped,
  };
};
