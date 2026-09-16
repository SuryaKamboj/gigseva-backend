const mongoose = require('mongoose');
const { Schema } = mongoose;

const FederationSchema = new Schema({
  federationCode: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  state: { type: String, required: true },
  registrationNumber: String,
  registeredOfficeAddress: String,
  contactEmail: String,
  contactPhone: String,
  platformSplitRatio: {
    workerSharePercent: { type: Number, default: 85 },
    societySharePercent: { type: Number, default: 10 },
    referringSocietySharePercent: { type: Number, default: 0 },
    federationSharePercent: { type: Number, default: 5 }
  },
  taxRatePercent: { type: Number, default: 18 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Federation', FederationSchema);
