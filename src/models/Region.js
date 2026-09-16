const mongoose = require('mongoose');
const { Schema } = mongoose;

const RegionSchema = new Schema({
  regionCode: { type: String, required: true, unique: true },
  federationId: { type: Schema.Types.ObjectId, ref: 'Federation', required: true },
  societyId: { type: Schema.Types.ObjectId, ref: 'Society' },
  name: { type: String, required: true },
  state: String,
  district: String,
  pincodes: [String],
  boundary: {
    type: { type: String, enum: ['Polygon', 'MultiPolygon'] },
    coordinates: { type: Schema.Types.Mixed }
  },
  centerPoint: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }
  },
  demandMultiplier: { type: Number, default: 1.0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

RegionSchema.index({ centerPoint: '2dsphere' }, { sparse: true });
RegionSchema.index({ federationId: 1, isActive: 1 });

module.exports = mongoose.model('Region', RegionSchema);