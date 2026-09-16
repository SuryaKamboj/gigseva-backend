require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('./config/db');
const User = require('./models/User');
const Worker = require('./models/Worker');
const WorkerPrivate = require('./models/WorkerPrivate');
const Booking = require('./models/Booking');
const Service = require('./models/Service');
const Society = require('./models/Society');
const Region = require('./models/Region');
const Federation = require('./models/Federation');

async function main() {
  await connectDB();
  console.log('[Cleanup] Connected to MongoDB.');

  // 1. Clear all bookings
  await Booking.deleteMany({});
  console.log('[Cleanup] Cleared all bookings.');

  const society = await Society.findOne();
  const region = await Region.findOne();
  const federation = await Federation.findOne();

  // 2. Remove all workers except Rajesh Kumar (WK-DEL-001)
  const workersToDelete = await Worker.find({ workerCode: { $ne: 'WK-DEL-001' } });
  for (const w of workersToDelete) {
    await WorkerPrivate.deleteMany({ workerId: w._id });
    await User.deleteMany({ _id: w.userId });
    await Worker.deleteOne({ _id: w._id });
  }

  // Ensure Rajesh Kumar exists & is online
  let workerUser = await User.findOne({ mobileNumber: '+919811100001' });
  if (!workerUser) {
    workerUser = await User.create({
      mobileNumber: '+919811100001',
      fullName: 'Rajesh Kumar',
      role: 'WORKER',
      status: 'ACTIVE'
    });
  }

  let worker = await Worker.findOne({ workerCode: 'WK-DEL-001' });
  if (!worker) {
    worker = await Worker.create({
      userId: workerUser._id,
      workerCode: 'WK-DEL-001',
      societyId: society ? society._id : null,
      federationId: federation ? federation._id : null,
      primaryRegionId: region ? region._id : null,
      fullName: 'Rajesh Kumar',
      avatarUrl: 'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=400',
      gender: 'MALE',
      languagesSpoken: ['Hindi', 'English'],
      primaryServiceCategory: 'ELECTRICAL',
      experienceTier: 'MASTER',
      availabilityStatus: 'AVAILABLE',
      isOnline: true,
      currentLocation: { type: 'Point', coordinates: [77.2090, 28.5300] },
      kycVerificationStatus: 'VERIFIED',
      membershipStatus: 'ACTIVE_MEMBER',
      shareholderFolioNumber: 'COOP-SH-1001',
      metrics: {
        averageRating: 4.9,
        reviewCount: 142,
        completedJobsCount: 198,
        acceptanceRate: 98,
        cancellationRate: 1,
        trustScore: 96
      }
    });
  } else {
    worker.isOnline = true;
    worker.availabilityStatus = 'AVAILABLE';
    worker.fullName = 'Rajesh Kumar';
    worker.primaryServiceCategory = 'ELECTRICAL';
    await worker.save();
  }

  // 3. Clear all customers and create exactly 1 real customer
  await User.deleteMany({ role: 'CUSTOMER' });

  const customer = await User.create({
    mobileNumber: '+916396323790',
    fullName: 'Surya Dev Kamboj',
    email: 'surya@gigsevak.coop',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    addresses: [{
      addressId: 'addr-01',
      label: 'HOME',
      addressLine1: 'B-42 Lajpat Nagar II',
      city: 'New Delhi',
      state: 'Delhi',
      pincode: '110024',
      isDefault: true
    }]
  });

  const finalUsers = await User.find({}, 'fullName mobileNumber role').lean();
  const finalWorkers = await Worker.find({}, 'fullName workerCode primaryServiceCategory isOnline').lean();
  const elecSrv = await Service.findOne({ category: 'ELECTRICAL' }).lean();

  console.log('=== SEED STATE ===');
  console.log('Users count:', finalUsers.length, finalUsers);
  console.log('Workers count:', finalWorkers.length, finalWorkers);
  console.log('Worker MongoDB ID:', worker._id.toString());
  console.log('Customer MongoDB ID:', customer._id.toString());
  console.log('Electrical Service MongoDB ID:', elecSrv ? elecSrv._id.toString() : 'none');

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
