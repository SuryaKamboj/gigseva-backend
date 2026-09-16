const mongoose = require('mongoose');
const { Schema } = mongoose;

const WorkerPrivateSchema = new Schema({
  workerId: { type: Schema.Types.ObjectId, ref: 'Worker', required: true, unique: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  dateOfBirth: Date,
  mobileNumberFull: String,
  mobileNumberMasked: String,
  aadhaarNumberMasked: String,
  aadhaarVerificationHash: String,
  aadhaarFrontDocUrl: String,
  aadhaarBackDocUrl: String,
  policeClearanceCertUrl: String,
  panNumber: String,
  bankAccount: {
    accountHolderName: String,
    accountNumberEncrypted: String,
    accountNumberMasked: String,
    ifscCode: String,
    bankName: String,
    branchName: String,
    payoutMode: { type: String, enum: ['NEFT', 'IMPS', 'UPI'] },
    upiId: String,
    isVerified: { type: Boolean, default: false }
  },
  emergencyContact: {
    name: String,
    relationship: String,
    mobileNumber: String
  },
  insurance: {
    provider: String,
    policyNumber: String,
    coverageType: String,
    expiresAt: Date
  },
  schedulePreferences: {
    preferredWorkingDays: [String],
    preferredStartTime: String,
    preferredEndTime: String,
    maxDailyJobs: Number
  },
  earnings: {
    totalLifetimeEarnings: { type: Number, default: 0 },
    currentMonthEarnings: { type: Number, default: 0 },
    lastSettlementDate: Date
  },
  verificationAudit: {
    verifiedByAdminId: { type: Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: Date,
    rejectionReason: String,
    notes: String
  }
}, { timestamps: true });

module.exports = mongoose.model('WorkerPrivate', WorkerPrivateSchema);
