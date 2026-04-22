import mongoose from 'mongoose';

const RuleSchema = new mongoose.Schema(
  {
    deviceId: { type: Number, required: true, index: true },
    vehicleName: { type: String, required: true },
    metric: {
      type: String,
      enum: ['speed', 'device_offline', 'device_online'],
      required: true,
      index: true,
    },
    limit: { type: Number, default: null },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

RuleSchema.index({ deviceId: 1, metric: 1 }, { unique: true });

export const RuleModel = mongoose.model('Rule', RuleSchema);
