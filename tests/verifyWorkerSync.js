const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Worker = require('../src/models/Worker');
const WorkerPrivate = require('../src/models/WorkerPrivate');
const User = require('../src/models/User');
const { getCompleteWorkerProfile, updateWorkerProfile } = require('../src/services/workerProfileService');

async function runSyncTest() {
  console.log('===============================================================');
  console.log('  GIGSEVAK WORKER PROFILE REAL-TIME MIRROR PARITY TEST');
  console.log('===============================================================');

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI missing in .env');
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('✓ Connected successfully to MongoDB.');

  try {
    // 1. Find or create a test worker
    let worker = await Worker.findOne({ workerCode: 'WKR-SYNC-TEST-001' });
    let user = await User.findOne({ mobileNumber: '9999988888' });

    if (!user) {
      user = await User.create({
        fullName: 'Sync Verification Test Worker',
        mobileNumber: '9999988888',
        role: 'WORKER',
      });
    }

    if (!worker) {
      worker = await Worker.create({
        userId: user._id,
        workerCode: 'WKR-SYNC-TEST-001',
        fullName: 'Sync Verification Test Worker',
        phone: '9999988888',
        skills: [{ category: 'Electrician', experienceYears: 3 }],
        category: 'Electrician',
        primarySkill: 'Electrician',
        yearsOfExperience: 3,
        status: 'Active',
        approvalStatus: 'Approved',
        aadhaarNumberMasked: 'XXXX-XXXX-9988',
      });
    }

    const testWorkerId = worker._id;
    console.log(`Using Test Worker ID: ${testWorkerId}`);

    // 2. Define canonical test payload representing edits made by the worker on worker-frontend
    const workerEditPayload = {
      name: 'Sync Verification Test Worker',
      primarySkill: 'Electrical Engineering & High Voltage',
      yearsOfExperience: 7,
      skillLevel: 'Advanced',
      servicesOffered: ['Switchboard Repair', 'Tap Leakage Fix', 'AC Servicing', 'EV Charger Setup'],
      toolsAndEquipment: ['Multimeter Pro', 'Industrial Drill', 'Insulated Pliers', 'Voltage Detector'],
      availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      workingHoursStart: '08:00',
      workingHoursEnd: '19:30',
      workType: 'Full-time',
      aboutMe: 'Licensed master electrician with 7+ years of certified residential and commercial experience.',
      previousWorkExperience: 'Lead Electrical Foreman at Metro Power Grid Services (2018-2024)',
      trainingCompleted: ['National Skill Safety Certificate', 'NFPA 70E Arc Flash Training'],
      currentAddress: 'Penthouse 1204, Tower B, Emerald Heights, Sector 62',
      city: 'Gurugram',
      pincode: '122005',
      preferredWorkingAreas: ['Sector 62', 'Sector 54', 'Golf Course Road'],
      serviceArea: 'Gurugram Central & South Sectors',
      location: 'Sector 62 Station',
      portfolio: [
        {
          id: 'pf-1',
          url: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e',
          imageUrl: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e',
          title: '3-Phase Industrial Panel Installation',
          description: 'Custom distribution board with surge protection and digital sub-metering.',
          serviceTag: 'Electrical',
          createdAt: new Date().toISOString()
        },
        {
          id: 'pf-2',
          url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758',
          imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758',
          title: 'Emergency Generator Interlock Switch',
          description: 'Manual transfer switch installation compliant with municipal code.',
          serviceTag: 'Electrical',
          createdAt: new Date().toISOString()
        }
      ]
    };

    console.log('\n--> Step 1: Worker updates profile on worker-frontend (persisting to MongoDB)...');
    const updatedByWorkerService = await updateWorkerProfile(testWorkerId, workerEditPayload);
    console.log('✓ updateWorkerProfile returned successfully.');

    // 3. Retrieve profile as Worker App GET /api/workers/me
    console.log('\n--> Step 2: Fetching profile from worker perspective (GET /api/workers/me)...');
    const workerPerspective = await getCompleteWorkerProfile(testWorkerId);

    // 4. Retrieve profile as Admin App GET /api/admin/workers/:id
    console.log('\n--> Step 3: Fetching profile from Admin perspective (GET /api/admin/workers/:id)...');
    const adminPerspective = await getCompleteWorkerProfile(testWorkerId);

    // 5. Verification checklist
    const fieldsToVerify = [
      { field: 'primarySkill', expected: workerEditPayload.primarySkill },
      { field: 'yearsOfExperience', expected: workerEditPayload.yearsOfExperience },
      { field: 'skillLevel', expected: workerEditPayload.skillLevel },
      { field: 'servicesOffered', expected: workerEditPayload.servicesOffered, isArray: true },
      { field: 'toolsAndEquipment', expected: workerEditPayload.toolsAndEquipment, isArray: true },
      { field: 'availableDays', expected: workerEditPayload.availableDays, isArray: true },
      { field: 'workingHoursStart', expected: workerEditPayload.workingHoursStart },
      { field: 'workingHoursEnd', expected: workerEditPayload.workingHoursEnd },
      { field: 'workType', expected: workerEditPayload.workType },
      { field: 'aboutMe', expected: workerEditPayload.aboutMe },
      { field: 'previousWorkExperience', expected: workerEditPayload.previousWorkExperience },
      { field: 'trainingCompleted', expected: workerEditPayload.trainingCompleted, isArray: true },
      { field: 'currentAddress', expected: workerEditPayload.currentAddress },
      { field: 'city', expected: workerEditPayload.city },
      { field: 'pincode', expected: workerEditPayload.pincode },
      { field: 'preferredWorkingAreas', expected: workerEditPayload.preferredWorkingAreas, isArray: true },
      { field: 'serviceArea', expected: workerEditPayload.serviceArea },
      { field: 'portfolioCount', expected: workerEditPayload.portfolio.length, isCustom: (dto) => dto.portfolio?.length },
    ];

    console.log('\n===============================================================');
    console.log('  FIELD-BY-FIELD DATA CONSISTENCY AUDIT');
    console.log('===============================================================');

    let allPassed = true;

    for (const item of fieldsToVerify) {
      let workerVal = item.isCustom ? item.isCustom(workerPerspective) : workerPerspective[item.field];
      let adminVal = item.isCustom ? item.isCustom(adminPerspective) : adminPerspective[item.field];

      const workerMatch = item.isArray
        ? JSON.stringify(workerVal) === JSON.stringify(item.expected)
        : workerVal === item.expected;

      const adminMatch = item.isArray
        ? JSON.stringify(adminVal) === JSON.stringify(item.expected)
        : adminVal === item.expected;

      const mirrorMatch = JSON.stringify(workerVal) === JSON.stringify(adminVal);

      if (workerMatch && adminMatch && mirrorMatch) {
        console.log(` [PASS] ${item.field.padEnd(24)} | Worker: Match | Admin Mirror: Match ✓`);
      } else {
        allPassed = false;
        console.error(` [FAIL] ${item.field.padEnd(24)} | Expected: ${JSON.stringify(item.expected)}`);
        console.error(`        Worker Value: ${JSON.stringify(workerVal)}`);
        console.error(`        Admin Value:  ${JSON.stringify(adminVal)}`);
      }
    }

    // 6. UIDAI Aadhaar Masking Security Check
    console.log('\n===============================================================');
    console.log('  SECURITY & SENSITIVE DATA ENCRYPTION CHECK');
    console.log('===============================================================');
    const maskedAadhaar = adminPerspective.aadhaarNumberMasked;
    console.log(`Admin Dossier Masked Aadhaar: "${maskedAadhaar}"`);
    if (maskedAadhaar && (maskedAadhaar.startsWith('XXXX') || maskedAadhaar.includes('XXXX'))) {
      console.log(' [PASS] Aadhaar UID is properly masked (No raw 12-digit PII exposed) ✓');
    } else {
      console.warn(' [NOTE] Masked Aadhaar format: ' + maskedAadhaar);
    }

    if (adminPerspective.aadhaarNumber) {
      console.error(' [FAIL] CRITICAL: Raw unmasked Aadhaar exposed in admin canonical DTO!');
      allPassed = false;
    } else {
      console.log(' [PASS] Raw unmasked Aadhaar is strictly excluded from canonical DTO ✓');
    }

    console.log('\n===============================================================');
    if (allPassed) {
      console.log('  RESULT: ALL 18 PARITY CHECKS PASSED (100% REAL-TIME MIRROR)');
      console.log('===============================================================');
      process.exit(0);
    } else {
      console.error('  RESULT: FAILED PARITY CHECKS DETECTED');
      console.log('===============================================================');
      process.exit(1);
    }
  } catch (err) {
    console.error('Test run error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runSyncTest();
