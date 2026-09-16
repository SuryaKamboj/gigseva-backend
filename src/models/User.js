const mongoose = require('mongoose');
const { Schema } = mongoose;

const AddressSchema = new Schema({
  addressId: { type: String, required: true },
  label: { type: String, enum: ['HOME', 'WORK', 'OTHER'], default: 'HOME' },
  addressLine1: { type: String, required: true },
  addressLine2: String,
  landmark: String,
  city: { type: String, required: true },
  state: { type: String, required: true },
  pincode: { type: String },
  postalCode: { type: String },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }
  },
  isDefault: { type: Boolean, default: false }
}, { _id: false });

AddressSchema.pre('validate', function(next) {
  if (!this.pincode && this.postalCode) this.pincode = this.postalCode;
  if (!this.postalCode && this.pincode) this.postalCode = this.pincode;
  if (!this.pincode) this.pincode = '110001';
  next();
});

const UserSchema = new Schema({
  mobileNumber: { type: String, required: true, unique: true, index: true },
  email: String,
  fullName: { type: String, required: true },
  role: { type: String, enum: ['CUSTOMER', 'WORKER', 'SOCIETY_ADMIN', 'FEDERATION_ADMIN', 'SYSTEM_ADMIN', 'PLATFORM_SUPER_ADMIN'], required: true },
  languagePreference: { type: String, enum: ['en', 'pa', 'hi'], default: 'en' },
  preferredLanguage: { type: String, default: 'en' },
  avatarUrl: String,
  isBlocked: { type: Boolean, default: false },
  addresses: [AddressSchema],
  passwordHash: String,
  societyId: { type: Schema.Types.ObjectId, ref: 'Society' },
  federationId: { type: Schema.Types.ObjectId, ref: 'Federation' },
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);