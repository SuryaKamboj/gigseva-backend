const mongoose = require('mongoose');
const { Schema } = mongoose;

const SkillSchema = new Schema({
  serviceId: { type: Schema.Types.ObjectId, ref: 'Service' },
  category: String,
  experienceYears: Number,
  certificateNumber: String,
  isCertified: { type: Boolean, default: false }
}, { _id: false });

const WorkerSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  workerCode: { type: String, unique: true, index: true },
  societyId: { type: Schema.Types.ObjectId, ref: 'Society', index: true },
  federationId: { type: Schema.Types.ObjectId, ref: 'Federation' },
  primaryRegionId: { type: Schema.Types.ObjectId, ref: 'Region' },
  operatingRegionIds: [{ type: Schema.Types.ObjectId, ref: 'Region' }],
  fullName: { type: String, required: true },
  avatarUrl: String,
  gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER'] },
  languagesSpoken: [String],
  primaryServiceCategory: String,
  experienceTier: { type: String, enum: ['STANDARD', 'SENIOR', 'MASTER'], default: 'STANDARD' },
  skills: [SkillSchema],
  availabilityStatus: { type: String, enum: ['AVAILABLE', 'ON_JOB', 'OFF_DUTY', 'SUSPENDED'], default: 'OFF_DUTY' },
  isOnline: { type: Boolean, default: false },
  lastActiveAt: Date,
  currentLocation: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }
  },
  kycVerificationStatus: { type: String, enum: ['PENDING', 'IN_REVIEW', 'VERIFIED', 'REJECTED'], default: 'PENDING' },
  membershipStatus: { type: String, enum: ['APPLICANT', 'ACTIVE_MEMBER', 'PROBATIONARY', 'SUSPENDED'], default: 'APPLICANT' },
  shareholderFolioNumber: String,
  aadhaarNumberMasked: String,
  aadhaarVerified: { type: Boolean, default: false },
  selfieUrl: String,
  serviceArea: String,
  addressLine: String,
  currentAddress: String,
  city: String,
  pincode: String,
  preferredWorkingAreas: [String],
  dateOfBirth: String,
  primarySkill: String,
  yearsOfExperience: { type: Number, default: 0 },
  skillLevel: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert'], default: 'Intermediate' },
  servicesOffered: [String],
  toolsAndEquipment: [String],
  availableDays: { type: [String], default: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] },
  workingHoursStart: { type: String, default: '09:00' },
  workingHoursEnd: { type: String, default: '18:00' },
  workType: { type: String, enum: ['Full-time', 'Part-time', 'Contract', 'On-demand'], default: 'Full-time' },
  aboutMe: { type: String, default: '' },
  previousWorkExperience: { type: String, default: '' },
  certifications: [{
    id: String,
    name: String,
    issuer: String,
    certificateNumber: String,
    documentUrl: String,
    status: { type: String, default: 'Submitted' },
    issueDate: String,
    expiryDate: String,
    verifiedDate: String,
    verifiedBy: String,
    rejectionReason: String
  }],
  trainingCompleted: [String],
  portfolio: [{
    id: String,
    url: String,
    title: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  insurance: {
    status: { type: String, default: 'Not Applied' },
    planName: String,
    coverage: String,
    policyNumber: String,
    validUntil: String,
    applicationDate: String,
    rejectionReason: String
  },
  activityLogs: [{
    id: String,
    date: String,
    time: String,
    action: String,
    details: String,
    performedBy: String
  }],
  rejectionReason: String,
  metrics: {
    averageRating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    completedJobsCount: { type: Number, default: 0 },
    acceptanceRate: { type: Number, default: 0 },
    cancellationRate: { type: Number, default: 0 },
    trustScore: { type: Number, default: 70 }
  }
}, { timestamps: true });

WorkerSchema.index({ currentLocation: '2dsphere' });
WorkerSchema.index({ societyId: 1, availabilityStatus: 1 });
WorkerSchema.index({ societyId: 1, experienceTier: 1 });

module.exports = mongoose.model('Worker', WorkerSchema);
