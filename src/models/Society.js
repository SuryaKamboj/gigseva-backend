const mongoose = require('mongoose');
const { Schema } = mongoose;

const SocietySchema = new Schema({
  federationId: { type: Schema.Types.ObjectId, ref: 'Federation', required: true },
  societyCode: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  registrationNumber: String,
  primaryRegionId: { type: Schema.Types.ObjectId, ref: 'Region' },
  jurisdictionRegionIds: [{ type: Schema.Types.ObjectId, ref: 'Region' }],
  officeAddress: {
    street: String, city: String, district: String, state: String, pincode: String
  },
  officeLocation: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }
  },
  contactPerson: { name: String, designation: String, phone: String, email: String },
  bankDetails: { accountNumber: String, ifscCode: String, bankName: String },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Society', SocietySchema);
