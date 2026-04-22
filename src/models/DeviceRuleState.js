import mongoose from 'mongoose';

const DeviceRuleStateSchema = new mongoose.Schema(
  {
    ruleKey: { type: String, required: true, unique: true, index: true },
    deviceId: { type: Number, required: true, index: true },
    metric: { type: String, required: true, index: true },
    statusValue: { type: String, default: null },
    speedBreached: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const DeviceRuleStateModel = mongoose.model('DeviceRuleState', DeviceRuleStateSchema);
