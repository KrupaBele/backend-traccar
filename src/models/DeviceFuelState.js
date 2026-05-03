import mongoose from 'mongoose';

const deviceFuelStateSchema = new mongoose.Schema(
  {
    deviceId: { type: Number, required: true, unique: true, index: true },
    fuel: { type: Number, default: 0 },
    fuelLevel: { type: Number, default: 0 },
    fixTime: { type: Date, default: null },
  },
  { timestamps: true }
);

export const DeviceFuelState =
  mongoose.models.DeviceFuelState || mongoose.model('DeviceFuelState', deviceFuelStateSchema);

export default DeviceFuelState;
