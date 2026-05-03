import DeviceFuelState from '../models/DeviceFuelState.js';

const asNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const extractFuelState = (position) => {
  const attributes = position?.attributes || {};
  const fuel = asNumber(attributes.fuel);
  const fuelLevel = asNumber(attributes.fuelLevel);

  if (fuel <= 0 && fuelLevel <= 0) {
    return null;
  }

  return {
    deviceId: Number(position?.deviceId),
    fuel: fuel > 0 ? fuel : fuelLevel,
    fuelLevel: fuelLevel > 0 ? fuelLevel : fuel,
    fixTime: position?.fixTime ? new Date(position.fixTime) : null,
  };
};

export const upsertFuelFromPositions = async (positions = []) => {
  if (!Array.isArray(positions) || positions.length === 0) {
    return;
  }

  const updatesByDeviceId = new Map();
  for (const position of positions) {
    const extracted = extractFuelState(position);
    if (!extracted || !Number.isFinite(extracted.deviceId) || extracted.deviceId <= 0) {
      continue;
    }
    updatesByDeviceId.set(extracted.deviceId, extracted);
  }

  if (updatesByDeviceId.size === 0) {
    return;
  }

  const operations = Array.from(updatesByDeviceId.values()).map((entry) => ({
    updateOne: {
      filter: { deviceId: entry.deviceId },
      update: {
        $set: {
          fuel: entry.fuel,
          fuelLevel: entry.fuelLevel,
          fixTime: entry.fixTime,
        },
      },
      upsert: true,
    },
  }));

  await DeviceFuelState.bulkWrite(operations, { ordered: false });
};

export const upsertFuelEntries = async (entries = []) => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return;
  }

  const validEntries = entries.filter(
    (entry) =>
      Number.isFinite(Number(entry?.deviceId)) &&
      Number(entry.deviceId) > 0 &&
      (asNumber(entry?.fuel) > 0 || asNumber(entry?.fuelLevel) > 0)
  );

  if (validEntries.length === 0) {
    return;
  }

  const operations = validEntries.map((entry) => {
    const fuel = asNumber(entry.fuel);
    const fuelLevel = asNumber(entry.fuelLevel);
    return {
      updateOne: {
        filter: { deviceId: Number(entry.deviceId) },
        update: {
          $set: {
            fuel: fuel > 0 ? fuel : fuelLevel,
            fuelLevel: fuelLevel > 0 ? fuelLevel : fuel,
            fixTime: entry.fixTime ? new Date(entry.fixTime) : null,
          },
        },
        upsert: true,
      },
    };
  });

  await DeviceFuelState.bulkWrite(operations, { ordered: false });
};

export const getFuelStatesByDeviceIds = async (deviceIds = []) => {
  const normalizedIds = deviceIds
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  const query =
    normalizedIds.length > 0
      ? { deviceId: { $in: normalizedIds } }
      : {};

  const docs = await DeviceFuelState.find(query).lean();
  return docs.map((doc) => ({
    deviceId: Number(doc.deviceId),
    fuel: asNumber(doc.fuel),
    fuelLevel: asNumber(doc.fuelLevel),
    fixTime: doc.fixTime || null,
    updatedAt: doc.updatedAt || null,
  }));
};

