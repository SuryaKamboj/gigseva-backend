const mongoose = require('mongoose');
const { Schema } = mongoose;

const PaymentSchema = new Schema({
  bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  workerId: { type: Schema.Types.ObjectId, ref: 'Worker' },
  gatewayProvider: { type: String, default: 'RAZORPAY' },
  gatewayOrderId: String,
  gatewayPaymentId: String,
  status: { type: String, enum: ['INITIATED','PENDING','CAPTURED','FAILED','REFUNDED','PARTIALLY_REFUNDED'], default: 'INITIATED' },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  pricingSnapshot: Schema.Types.Mixed,
  refunds: [{
    amount: Number,
    reason: String,
    gatewayRefundId: String,
    refundedAt: Date,
    refundedByAdminId: { type: Schema.Types.ObjectId, ref: 'User' }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Payment', PaymentSchema);
