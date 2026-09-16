const mongoose = require('mongoose');
const { Schema } = mongoose;

const ComplaintSchema = new Schema({
  complaintCode: { type: String, required: true, unique: true },
  bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
  complainantUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  accusedWorkerId: { type: Schema.Types.ObjectId, ref: 'Worker' },
  accusedUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  category: { type: String, enum: ['POOR_WORKMANSHIP','WORKER_MISCONDUCT','PRICING_DISPUTE','LATE_ARRIVAL','INCOMPLETE_JOB','MATERIAL_FRAUD','OTHER'], required: true },
  severity: { type: String, enum: ['LOW','MEDIUM','HIGH','CRITICAL'], default: 'MEDIUM' },
  description: { type: String, required: true },
  evidencePhotoUrls: [String],
  status: { type: String, enum: ['SUBMITTED','UNDER_REVIEW','SOCIETY_INVESTIGATION','FEDERATION_REVIEW','RESOLVED','DISMISSED'], default: 'SUBMITTED' },
  assignedToAdminId: { type: Schema.Types.ObjectId, ref: 'User' },
  resolution: {
    action: { type: String, enum: ['DISMISSED','WARNING_ISSUED','PARTIAL_REFUND','FULL_REFUND','WORKER_SUSPENDED','WORKER_BLACKLISTED'] },
    refundAmount: Number,
    comments: String,
    resolvedAt: Date,
    resolvedByAdminId: { type: Schema.Types.ObjectId, ref: 'User' }
  }
}, { timestamps: true });

module.exports = mongoose.model('Complaint', ComplaintSchema);
