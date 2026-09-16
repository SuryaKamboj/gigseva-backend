const mongoose = require('mongoose');
const Worker = require('../models/Worker');
const WorkerPrivate = require('../models/WorkerPrivate');
const User = require('../models/User');
const WorkGalleryItem = require('../models/WorkGalleryItem');

/**
 * Normalizes working hours into a human-readable 12-hour or 24-hour range
 */
function formatWorkingHours(start, end) {
  if (!start && !end) return '09:00 AM – 06:00 PM';
  const formatTime = (t) => {
    if (!t) return '';
    if (t.includes('AM') || t.includes('PM')) return t;
    const [h, m] = t.split(':').map(Number);
    if (isNaN(h)) return t;
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    const minStr = isNaN(m) ? '00' : String(m).padStart(2, '0');
    return `${hour12}:${minStr} ${period}`;
  };
  return `${formatTime(start || '09:00')} – ${formatTime(end || '18:00')}`;
}

/**
 * Formats date into DD MMM YYYY or returns fallback
 */
function formatDate(d) {
  if (!d) return '';
  try {
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  } catch {}
  return String(d);
}

/**
 * Canonical service to get complete worker profile
 * @param {string|mongoose.Types.ObjectId} workerIdOrCode - Worker _id, workerCode, or userId
 * @param {object} callerUser - Authenticated user context
 */
async function getCompleteWorkerProfile(workerIdOrCode, callerUser = null) {
  if (!workerIdOrCode) return null;

  let worker = null;
  const isObjectId = mongoose.Types.ObjectId.isValid(workerIdOrCode);

  if (isObjectId) {
    worker = await Worker.findById(workerIdOrCode)
      .populate('userId', 'fullName mobileNumber email')
      .populate('societyId', 'name societyCode')
      .populate('primaryRegionId', 'name');
  }

  if (!worker) {
    worker = await Worker.findOne({ workerCode: String(workerIdOrCode) })
      .populate('userId', 'fullName mobileNumber email')
      .populate('societyId', 'name societyCode')
      .populate('primaryRegionId', 'name');
  }

  if (!worker && isObjectId) {
    worker = await Worker.findOne({ userId: workerIdOrCode })
      .populate('userId', 'fullName mobileNumber email')
      .populate('societyId', 'name societyCode')
      .populate('primaryRegionId', 'name');
  }

  if (!worker) return null;

  // Retrieve private data and gallery items
  const [workerPrivate, galleryItems] = await Promise.all([
    WorkerPrivate.findOne({ workerId: worker._id }),
    WorkGalleryItem.find({ workerId: worker._id, isPublic: true }).sort({ createdAt: -1 })
  ]);

  // Consolidate Portfolio / Proof-of-Work images
  const portfolioMap = new Map();
  if (Array.isArray(worker.portfolio)) {
    worker.portfolio.forEach((p, idx) => {
      if (p && p.url) {
        portfolioMap.set(p.url, {
          id: p.id || `p-${idx}`,
          url: p.url,
          title: p.title || 'Work Sample'
        });
      }
    });
  }
  if (Array.isArray(galleryItems)) {
    galleryItems.forEach((g) => {
      if (g && g.photoUrl && !portfolioMap.has(g.photoUrl)) {
        portfolioMap.set(g.photoUrl, {
          id: g._id.toString(),
          url: g.photoUrl,
          title: g.caption || g.serviceCategory || 'Work Sample'
        });
      }
    });
  }
  const combinedPortfolio = Array.from(portfolioMap.values());

  // Consolidate Certifications
  let certifications = [];
  if (Array.isArray(worker.certifications) && worker.certifications.length > 0) {
    certifications = worker.certifications.map((c, idx) => ({
      id: c.id || `cert-${idx + 1}`,
      name: typeof c === 'string' ? c : c.name || 'Trade Certificate',
      issuer: c.issuer || '',
      certificateNumber: c.certificateNumber || '',
      documentUrl: c.documentUrl || '',
      status: c.status || 'Verified',
      issueDate: c.issueDate || '',
      expiryDate: c.expiryDate || '',
      verifiedDate: c.verifiedDate || '',
      verifiedBy: c.verifiedBy || 'Admin Officer',
      rejectionReason: c.rejectionReason || ''
    }));
  } else if (Array.isArray(workerPrivate?.kyc?.skillCertificateUrls) && workerPrivate.kyc.skillCertificateUrls.length > 0) {
    certifications = workerPrivate.kyc.skillCertificateUrls.map((url, idx) => ({
      id: `cert-priv-${idx + 1}`,
      name: `Trade Credential ${idx + 1}`,
      documentUrl: url,
      status: 'Verified',
      verifiedBy: 'Admin Officer'
    }));
  }

  // Identity & contact resolution
  const workerUser = worker.userId || {};
  const phone = workerUser.mobileNumber || workerPrivate?.mobileNumberFull || workerPrivate?.phone || '';
  const fullName = worker.fullName || workerUser.fullName || 'Worker Partner';
  const avatarUrl = worker.avatarUrl || worker.selfieUrl || '';
  const dateOfBirth = worker.dateOfBirth || (workerPrivate?.dateOfBirth ? formatDate(workerPrivate.dateOfBirth) : '');
  const gender = worker.gender || workerPrivate?.gender || 'Male';

  // Professional attributes
  const primarySkill = worker.primarySkill || worker.primaryServiceCategory || worker.skills?.[0]?.category || 'Electrician';
  const yearsOfExp = typeof worker.yearsOfExperience === 'number'
    ? worker.yearsOfExperience
    : (parseInt(worker.yearsOfExperience, 10) || worker.skills?.[0]?.experienceYears || 0);

  const skillLevel = worker.skillLevel || (worker.experienceTier === 'MASTER' ? 'Expert' : worker.experienceTier === 'SENIOR' ? 'Intermediate' : 'Beginner');

  const servicesOffered = Array.isArray(worker.servicesOffered) && worker.servicesOffered.length > 0
    ? worker.servicesOffered
    : (Array.isArray(worker.skills) && worker.skills.length > 0
        ? worker.skills.map((s) => (typeof s === 'string' ? s : s.category)).filter(Boolean)
        : [primarySkill]);

  const toolsAndEquipment = Array.isArray(worker.toolsAndEquipment) && worker.toolsAndEquipment.length > 0
    ? worker.toolsAndEquipment
    : (Array.isArray(workerPrivate?.toolsAndEquipment) ? workerPrivate.toolsAndEquipment : []);

  const trainingCompleted = Array.isArray(worker.trainingCompleted) ? worker.trainingCompleted : [];
  const aboutMe = worker.aboutMe || '';
  const previousWorkExperience = worker.previousWorkExperience || '';

  // Work Preferences
  const availableDays = Array.isArray(worker.availableDays) && worker.availableDays.length > 0
    ? worker.availableDays
    : (Array.isArray(workerPrivate?.schedulePreferences?.preferredWorkingDays)
        ? workerPrivate.schedulePreferences.preferredWorkingDays
        : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);

  const workingHoursStart = worker.workingHoursStart || workerPrivate?.schedulePreferences?.preferredStartTime || '09:00';
  const workingHoursEnd = worker.workingHoursEnd || workerPrivate?.schedulePreferences?.preferredEndTime || '18:00';
  const workType = worker.workType || 'Full-time';
  const workingHoursDisplay = formatWorkingHours(workingHoursStart, workingHoursEnd);

  // Location resolution
  const currentAddress = worker.currentAddress || worker.addressLine || workerPrivate?.privateAddress?.street || '';
  const city = worker.city || workerPrivate?.privateAddress?.city || '';
  const pincode = worker.pincode || workerPrivate?.privateAddress?.pincode || '';
  const locationDisplay = [currentAddress, city, pincode].filter(Boolean).join(', ') || worker.serviceArea || 'New Delhi';
  const serviceArea = worker.serviceArea || (city ? `${city} & Surrounding Areas` : 'Delhi NCR & Surrounding Areas');
  const preferredWorkingAreas = Array.isArray(worker.preferredWorkingAreas) && worker.preferredWorkingAreas.length > 0
    ? worker.preferredWorkingAreas
    : (servicesOffered.length > 0 ? servicesOffered : [primarySkill]);

  // Verification resolution
  const aadhaarMasked = worker.aadhaarNumberMasked || workerPrivate?.aadhaarNumberMasked || 'XXXX-XXXX-0000';
  const aadhaarVerified = worker.aadhaarVerified !== false;
  const kycStatus = (worker.kycVerificationStatus || 'PENDING').toUpperCase();
  const approvalStatus = kycStatus === 'VERIFIED' ? 'Approved' : kycStatus === 'REJECTED' ? 'Rejected' : 'Pending';
  const accountStatus = kycStatus === 'VERIFIED'
    ? (worker.availabilityStatus === 'SUSPENDED' ? 'Suspended' : 'Active')
    : 'Inactive';

  const joinedDate = formatDate(worker.createdAt) || 'Today';

  // Insurance info
  const insuranceInfo = {
    status: worker.insurance?.status || (workerPrivate?.insurance ? 'Active' : 'Not Applied'),
    planName: worker.insurance?.planName || workerPrivate?.insurance?.provider || 'Basic Worker Protection Plan',
    coverage: worker.insurance?.coverage || (workerPrivate?.insurance?.coverageType ? '₹5,00,000' : '₹2,00,000'),
    policyNumber: worker.insurance?.policyNumber || workerPrivate?.insurance?.policyNumber || '',
    validUntil: worker.insurance?.validUntil || (workerPrivate?.insurance?.expiresAt ? formatDate(workerPrivate.insurance.expiresAt) : ''),
    applicationDate: worker.insurance?.applicationDate || joinedDate,
    rejectionReason: worker.insurance?.rejectionReason || ''
  };

  // Activity logs
  const activityLogs = Array.isArray(worker.activityLogs) && worker.activityLogs.length > 0
    ? worker.activityLogs
    : [
        {
          id: `init-log-${worker._id}`,
          date: joinedDate,
          time: '10:00 AM',
          action: 'Profile Synchronized',
          details: `Worker registered in cooperative registry under Aadhaar ${aadhaarMasked}.`,
          performedBy: 'Cooperative Registry Engine'
        }
      ];

  const profileCompletion = kycStatus === 'VERIFIED' ? 100 : 80;

  // Canonical Worker Profile Document
  return {
    id: worker.workerCode || worker._id.toString(),
    workerId: worker._id.toString(),
    workerCode: worker.workerCode || worker._id.toString(),
    userId: (worker.userId?._id || worker.userId || '').toString(),
    name: fullName,
    fullName,
    phone,
    email: workerUser.email || '',
    image: avatarUrl || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    avatarUrl,
    profilePhoto: avatarUrl,
    dateOfBirth,
    gender,
    primarySkill,
    category: primarySkill,
    additionalSkills: servicesOffered,
    skills: servicesOffered,
    yearsOfExperience: yearsOfExp,
    skillLevel,
    servicesOffered,
    toolsAndEquipment,
    availableDays,
    workingHoursStart,
    workingHoursEnd,
    workingHours: workingHoursDisplay,
    workType,
    aboutMe,
    previousWorkExperience,
    certifications,
    trainingCompleted,
    portfolio: combinedPortfolio,
    currentAddress,
    city,
    pincode,
    location: locationDisplay,
    serviceArea,
    preferredWorkingAreas,
    coordinates: worker.currentLocation?.coordinates || [0, 0],
    aadhaarNumberMasked: aadhaarMasked,
    aadhaarVerified,
    selfieUrl: worker.selfieUrl || avatarUrl,
    kycVerificationStatus: kycStatus,
    approvalStatus,
    status: accountStatus,
    membershipStatus: worker.membershipStatus || 'APPLICANT',
    isOnline: Boolean(worker.isOnline),
    availabilityStatus: worker.availabilityStatus || 'OFF_DUTY',
    rejectionReason: worker.rejectionReason,
    profileCompletion,
    adminRemarks: worker.rejectionReason || '',
    insurance: insuranceInfo,
    activityLogs,
    totalJobs: worker.metrics?.completedJobsCount || 0,
    completedJobs: worker.metrics?.completedJobsCount || 0,
    cancelledJobs: 0,
    averageRating: worker.metrics?.averageRating || 5.0,
    totalRatings: worker.metrics?.reviewCount || 0,
    complaintsCount: 0,
    reviews: [],
    joinedDate,
    createdAt: worker.createdAt,
    updatedAt: worker.updatedAt,

    // Structured sub-objects for domain-driven consumers
    identity: {
      workerId: worker._id.toString(),
      workerCode: worker.workerCode || worker._id.toString(),
      userId: (worker.userId?._id || worker.userId || '').toString(),
      fullName,
      phone,
      email: workerUser.email || '',
      profilePhoto: avatarUrl,
      dateOfBirth,
      gender
    },
    professional: {
      primarySkill,
      additionalSkills: servicesOffered,
      skillLevel,
      yearsOfExperience: yearsOfExp,
      servicesOffered,
      toolsAndEquipment,
      certifications,
      trainingCompleted,
      aboutMe,
      previousWorkExperience
    },
    workPreferences: {
      availableDays,
      workingHoursStart,
      workingHoursEnd,
      workingHours: workingHoursDisplay,
      workType
    },
    location: {
      currentAddress,
      city,
      pincode,
      preferredWorkingAreas,
      serviceArea,
      coordinates: worker.currentLocation?.coordinates || [0, 0]
    },
    media: {
      profilePhoto: avatarUrl,
      portfolio: combinedPortfolio
    },
    verification: {
      aadhaarNumberMasked: aadhaarMasked,
      aadhaarVerified,
      kycVerificationStatus: kycStatus,
      selfieUrl: worker.selfieUrl || avatarUrl,
      rejectionReason: worker.rejectionReason
    },
    statusSummary: {
      approvalStatus,
      accountStatus,
      membershipStatus: worker.membershipStatus,
      isOnline: Boolean(worker.isOnline),
      availabilityStatus: worker.availabilityStatus
    }
  };
}

/**
 * Updates a worker profile and returns the full canonical document
 */
async function updateWorkerProfile(workerIdOrUserId, updateData) {
  if (!workerIdOrUserId || !updateData) return null;

  const isObjectId = mongoose.Types.ObjectId.isValid(workerIdOrUserId);
  let worker = null;

  if (isObjectId) {
    worker = await Worker.findById(workerIdOrUserId);
  }
  if (!worker) {
    worker = await Worker.findOne({ workerCode: String(workerIdOrUserId) });
  }
  if (!worker && isObjectId) {
    worker = await Worker.findOne({ userId: workerIdOrUserId });
  }

  if (!worker) return null;

  const workerUpdates = {};
  const privateUpdates = {};

  // Identity & Contact
  if (updateData.fullName !== undefined && updateData.fullName.trim()) {
    workerUpdates.fullName = updateData.fullName.trim();
    await User.findByIdAndUpdate(worker.userId, { $set: { fullName: updateData.fullName.trim() } });
  }
  if (updateData.name !== undefined && updateData.name.trim() && !workerUpdates.fullName) {
    workerUpdates.fullName = updateData.name.trim();
    await User.findByIdAndUpdate(worker.userId, { $set: { fullName: updateData.name.trim() } });
  }
  if (updateData.avatarUrl !== undefined) {
    workerUpdates.avatarUrl = updateData.avatarUrl;
  }
  if (updateData.avatar !== undefined && !workerUpdates.avatarUrl) {
    workerUpdates.avatarUrl = updateData.avatar;
  }
  if (updateData.selfieUrl !== undefined) {
    workerUpdates.selfieUrl = updateData.selfieUrl;
    if (!workerUpdates.avatarUrl) workerUpdates.avatarUrl = updateData.selfieUrl;
  }
  if (updateData.gender !== undefined) workerUpdates.gender = updateData.gender;
  if (updateData.dateOfBirth !== undefined) workerUpdates.dateOfBirth = updateData.dateOfBirth;

  // Professional attributes
  if (updateData.primarySkill !== undefined) {
    workerUpdates.primarySkill = updateData.primarySkill;
    workerUpdates.primaryServiceCategory = updateData.primarySkill.toUpperCase();
  }
  if (updateData.primaryServiceCategory !== undefined) {
    workerUpdates.primaryServiceCategory = updateData.primaryServiceCategory.toUpperCase();
    if (!workerUpdates.primarySkill) workerUpdates.primarySkill = updateData.primaryServiceCategory;
  }
  if (updateData.yearsOfExperience !== undefined) {
    const num = typeof updateData.yearsOfExperience === 'number'
      ? updateData.yearsOfExperience
      : (parseInt(String(updateData.yearsOfExperience).replace(/\D/g, ''), 10) || 0);
    workerUpdates.yearsOfExperience = num;
  }
  if (updateData.skillLevel !== undefined) {
    workerUpdates.skillLevel = updateData.skillLevel;
    if (updateData.skillLevel === 'Expert') workerUpdates.experienceTier = 'MASTER';
    else if (updateData.skillLevel === 'Intermediate') workerUpdates.experienceTier = 'SENIOR';
    else workerUpdates.experienceTier = 'STANDARD';
  }
  if (Array.isArray(updateData.servicesOffered)) {
    workerUpdates.servicesOffered = updateData.servicesOffered;
    workerUpdates.skills = updateData.servicesOffered.map((s) => ({ category: s, isCertified: true }));
  }
  if (Array.isArray(updateData.toolsAndEquipment)) {
    workerUpdates.toolsAndEquipment = updateData.toolsAndEquipment;
    privateUpdates.toolsAndEquipment = updateData.toolsAndEquipment;
  }
  if (Array.isArray(updateData.certifications)) {
    workerUpdates.certifications = updateData.certifications.map((c, idx) => ({
      id: typeof c === 'object' && c.id ? c.id : `cert-${idx + 1}`,
      name: typeof c === 'string' ? c : c.name || 'Trade Certificate',
      issuer: typeof c === 'object' ? c.issuer || '' : '',
      certificateNumber: typeof c === 'object' ? c.certificateNumber || '' : '',
      documentUrl: typeof c === 'object' ? c.documentUrl || '' : '',
      status: typeof c === 'object' ? c.status || 'Verified' : 'Verified',
      verifiedDate: typeof c === 'object' ? c.verifiedDate || '' : '',
      verifiedBy: typeof c === 'object' ? c.verifiedBy || 'Admin Officer' : 'Admin Officer',
      rejectionReason: typeof c === 'object' ? c.rejectionReason || '' : ''
    }));
  }
  if (Array.isArray(updateData.trainingCompleted)) {
    workerUpdates.trainingCompleted = updateData.trainingCompleted;
  }
  if (updateData.aboutMe !== undefined) workerUpdates.aboutMe = updateData.aboutMe;
  if (updateData.previousWorkExperience !== undefined) workerUpdates.previousWorkExperience = updateData.previousWorkExperience;

  // Work preferences
  if (Array.isArray(updateData.availableDays)) {
    workerUpdates.availableDays = updateData.availableDays;
    privateUpdates['schedulePreferences.preferredWorkingDays'] = updateData.availableDays;
  }
  if (updateData.workingHoursStart !== undefined) {
    workerUpdates.workingHoursStart = updateData.workingHoursStart;
    privateUpdates['schedulePreferences.preferredStartTime'] = updateData.workingHoursStart;
  }
  if (updateData.workingHoursEnd !== undefined) {
    workerUpdates.workingHoursEnd = updateData.workingHoursEnd;
    privateUpdates['schedulePreferences.preferredEndTime'] = updateData.workingHoursEnd;
  }
  if (updateData.workType !== undefined) {
    workerUpdates.workType = updateData.workType;
  }

  // Location attributes
  if (updateData.currentAddress !== undefined) {
    workerUpdates.currentAddress = updateData.currentAddress;
    workerUpdates.addressLine = updateData.currentAddress;
    privateUpdates['privateAddress.street'] = updateData.currentAddress;
  }
  if (updateData.city !== undefined) {
    workerUpdates.city = updateData.city;
    privateUpdates['privateAddress.city'] = updateData.city;
  }
  if (updateData.pincode !== undefined) {
    workerUpdates.pincode = updateData.pincode;
    privateUpdates['privateAddress.pincode'] = updateData.pincode;
  }
  if (Array.isArray(updateData.preferredWorkingAreas)) {
    workerUpdates.preferredWorkingAreas = updateData.preferredWorkingAreas;
  }
  if (updateData.serviceArea !== undefined) {
    workerUpdates.serviceArea = updateData.serviceArea;
  }

  // Portfolio / Proof-of-Work images
  if (Array.isArray(updateData.portfolio)) {
    workerUpdates.portfolio = updateData.portfolio.map((p, idx) => ({
      id: p.id || `p-${Date.now()}-${idx}`,
      url: p.url,
      title: p.title || 'Work Sample',
      uploadedAt: p.uploadedAt || new Date()
    }));
  }

  // Insurance
  if (updateData.insurance !== undefined) {
    workerUpdates.insurance = updateData.insurance;
  }

  // Activity logs
  if (Array.isArray(updateData.activityLogs)) {
    workerUpdates.activityLogs = updateData.activityLogs;
  }

  // Execute update on Worker
  const updatedWorker = await Worker.findByIdAndUpdate(
    worker._id,
    { $set: workerUpdates },
    { new: true, runValidators: true }
  );

  // Sync with WorkerPrivate if exists
  if (Object.keys(privateUpdates).length > 0) {
    await WorkerPrivate.findOneAndUpdate(
      { workerId: worker._id },
      { $set: privateUpdates },
      { upsert: false }
    );
  }

  // Return complete canonical profile
  return await getCompleteWorkerProfile(updatedWorker._id);
}

module.exports = {
  getCompleteWorkerProfile,
  updateWorkerProfile
};
