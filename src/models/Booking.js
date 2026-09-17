const mongoose = require('mongoose');
const { Schema } = mongoose;

const PricingSchema = new Schema({
  baseLaborAmount: { type: Number, default: 0 },
  materialAmount: { type: Number, default: 0 },
  additionalCharges: { type: Number, default: 0 },
  platformFee: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  workerPayoutAmount: { type: Number, default: 0 },
  servicingSocietyAmount: { type: Number, default: 0 },
  referringSocietyAmount: { type: Number, default: 0 },
  platformReserveAmount: { type: Number, default: 0 }
}, { _id: false });

const MaterialRequestSchema = new Schema({
  requestId: { type: String, required: true },
  status: { type: String, enum: ['PENDING_APPROVAL', 'APPROVED', 'REJECTED'], default: 'PENDING_APPROVAL' },
  claimedAmount: { type: Number, required: true },
  description: { type: String, required: true },
  receiptImageUrl: String,
  requestedAt: { type: Date, default: Date.now },
  resolvedAt: Date
}, { _id: false });

const DispatchLogSchema = new Schema({
  workerId: { type: Schema.Types.ObjectId, ref: 'Worker' },
  action: { type: String, enum: ['OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED'] },
  timestamp: { type: Date, default: Date.now },
  reason: String
}, { _id: false });

const BookingSchema = new Schema({
  bookingCode: { type: String, required: true, unique: true, index: true },
  bookingId: { type: String, index: true },
  bookingType: { type: String, enum: ['STANDARD', 'EMERGENCY_SOS', 'COMMUNITY_POOL', 'VOICE_BOOKING'], default: 'STANDARD' },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  workerId: { type: Schema.Types.ObjectId, ref: 'Worker', default: null },
  servicingSocietyId: { type: Schema.Types.ObjectId, ref: 'Society', required: true },
  referringSocietyId: { type: Schema.Types.ObjectId, ref: 'Society', default: null },
  federationId: { type: Schema.Types.ObjectId, ref: 'Federation', required: true },
  regionId: { type: Schema.Types.ObjectId, ref: 'Region', required: true },
  serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
  teamId: { type: String, default: null },
  parentBookingId: { type: Schema.Types.ObjectId, ref: 'Booking', default: null },
  isTeamLead: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ['PENDING', 'REQUESTED', 'ALLOCATED', 'ACCEPTED', 'IN_TRANSIT', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
    default: 'PENDING',
    index: true
  },
  reallocationCount: { type: Number, default: 0 },
  declinedWorkerIds: [{ type: Schema.Types.ObjectId, ref: 'Worker' }],
  dispatchLog: [DispatchLogSchema],
  serviceAddress: {
    addressLine1: String, addressLine2: String, landmark: String,
    city: String, state: String, pincode: String,
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }
    }
  },
  scheduledStartTime: { type: Date, required: true },
  actualStartTime: Date,
  completedAt: Date,
  security: {
    otpHash: String,
    failedAttempts: { type: Number, default: 0 },
    lockedUntil: Date,
    verifiedAt: Date
  },
  materialRequests: [MaterialRequestSchema],
  pricing: { type: PricingSchema, default: () => ({}) },
  cancellationDetails: {
    cancelledBy: { type: String, enum: ['CUSTOMER', 'WORKER', 'ADMIN', 'SYSTEM'] },
    cancellerUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    reason: String,
    cancelledAt: Date,
    penaltyCharged: { type: Number, default: 0 }
  },
  notes: String
}, { timestamps: true });

BookingSchema.pre('save', function(next) {
  if (!this.bookingId && this.bookingCode) {
    this.bookingId = this.bookingCode;
  }
  next();
});

BookingSchema.set('toJSON', { virtuals: true });
BookingSchema.set('toObject', { virtuals: true });

BookingSchema.index({ userId: 1, createdAt: -1 });
BookingSchema.index({ workerId: 1, status: 1 });
BookingSchema.index({ servicingSocietyId: 1, status: 1 });
BookingSchema.index({ teamId: 1 }, { sparse: true });
BookingSchema.index({ status: 1, bookingType: 1, createdAt: -1 });

module.exports = mongoose.model('Booking', BookingSchema);

