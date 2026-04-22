import mongoose from 'mongoose';

const RuleEventSchema = new mongoose.Schema(
  {
    deviceId: { type: Number, required: true, index: true },
    deviceName: { type: String, required: true },
    metric: { type: String, required: true, index: true },
    value: { type: String, default: null },
    message: { type: String, required: true },
    source: { type: String, default: 'custom' },
    eventTime: { type: Date, required: true, index: true },
    whatsappSid: { type: String, default: null },
    whatsappStatus: { type: String, default: null },
    deliverySkippedReason: { type: String, default: null },
  },
  { timestamps: true }
);

export const RuleEventModel = mongoose.model('RuleEvent', RuleEventSchema);
