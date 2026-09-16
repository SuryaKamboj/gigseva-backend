require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { connectDB } = require('./config/db');
const User = require('./models/User');
const Worker = require('./models/Worker');
const WorkerPrivate = require('./models/WorkerPrivate');
const Federation = require('./models/Federation');
const Society = require('./models/Society');
const Region = require('./models/Region');
const Service = require('./models/Service');

async function seed(standalone = true) {
  try {
    if (standalone) {
      await connectDB();
    }
    console.log('[Seed] Seeding canonical database data...');

    // Clean up existing collections
    await Promise.all([
      User.deleteMany({}),
      Worker.deleteMany({}),
      WorkerPrivate.deleteMany({}),
      Federation.deleteMany({}),
      Society.deleteMany({}),
      Region.deleteMany({}),
      Service.deleteMany({})
    ]);

    // 1. Federation
    const federation = await Federation.create({
      federationCode: 'FED-DELHI-01',
      name: 'Delhi Cooperative Labor Federation',
      state: 'Delhi',
      gstin: '07AAAAA0000A1Z5',
      bankAccount: {
        accountHolderName: 'Delhi Cooperative Labor Federation',
        accountNumberMasked: 'Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢1234',
        ifscCode: 'SBIN0001234',
        bankName: 'State Bank of India'
      },
      policies: {
        platformReservePercent: 5,
        defaultTaxRatePercent: 18,
        disputeWindowDays: 7
      }
    });

    // 2. Societies
    const society1 = await Society.create({
      societyCode: 'SOC-SD-001',
      federationId: federation._id,
      name: 'South Delhi Worker Cooperative Society',
      registrationNumber: 'SOC/DL/2024/001',
      district: 'South Delhi',
      state: 'Delhi',
      revenueSharePercent: 10,
      bankAccount: {
        accountHolderName: 'South Delhi Worker Cooperative',
        accountNumberMasked: 'Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢5678',
        ifscCode: 'HDFC0005678',
        bankName: 'HDFC Bank'
      },
      status: 'ACTIVE'
    });

    const society2 = await Society.create({
      societyCode: 'SOC-ND-002',
      federationId: federation._id,
      name: 'North Delhi Labor Collective',
      registrationNumber: 'SOC/DL/2024/002',
      district: 'North Delhi',
      state: 'Delhi',
      revenueSharePercent: 10,
      bankAccount: {
        accountHolderName: 'North Delhi Labor Collective',
        accountNumberMasked: 'Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢9012',
        ifscCode: 'ICIC0009012',
        bankName: 'ICICI Bank'
      },
      status: 'ACTIVE'
    });

    // 3. Regions
    const region1 = await Region.create({
      regionCode: 'REG-SD-HAUZ-KHAS',
      societyId: society1._id,
      federationId: federation._id,
      name: 'Hauz Khas & Saket Cluster',
      pincodes: ['110016', '110017', '110029'],
      centroid: { type: 'Point', coordinates: [77.2060, 28.5494] },
      demandMultiplier: 1.0,
      status: 'ACTIVE'
    });

    const region2 = await Region.create({
      regionCode: 'REG-ND-CP',
      societyId: society2._id,
      federationId: federation._id,
      name: 'Connaught Place & Central',
      pincodes: ['110001', '110002', '110005'],
      centroid: { type: 'Point', coordinates: [77.2167, 28.6328] },
      demandMultiplier: 1.0,
      status: 'ACTIVE'
    });

    // 4. Services (9 Canonical Services)
    const services = await Service.insertMany([
      {
        serviceCode: 'SRV-ELEC-FAN', name: 'Ceiling Fan & Light Fixture Repair',
        category: 'ELECTRICAL',
        description: 'Comprehensive inspection, wiring fix, bearing lubrication, and regulator installation.',
        baseLaborPrice: 299,
        defaultDurationMinutes: 45,
        isActive: true,
        imageUrl: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=500'
      },
      {
        serviceCode: 'SRV-ELEC-SWITCH', name: 'Switchboard & Socket Installation',
        category: 'ELECTRICAL',
        description: 'Safe installation or replacement of modular switch plates, MCBs, and heavy sockets.',
        baseLaborPrice: 349,
        defaultDurationMinutes: 60,
        isActive: true,
        imageUrl: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=500'
      },
      {
        serviceCode: 'SRV-PLUMB-LEAK', name: 'Tap & Pipeline Leak Repair',
        category: 'PLUMBING',
        description: 'Precision repair of leaking taps, health faucets, angles, and concealed pipe joints.',
        baseLaborPrice: 249,
        defaultDurationMinutes: 45,
        isActive: true,
        imageUrl: 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=500'
      },
      {
        serviceCode: 'SRV-PLUMB-DRAIN', name: 'Drain Blockage Removal',
        category: 'PLUMBING',
        description: 'Deep mechanical drain snake cleaning for kitchen sinks, shower traps, and main drains.',
        baseLaborPrice: 499,
        defaultDurationMinutes: 60,
        isActive: true,
        imageUrl: 'https://images.unsplash.com/photo-1542013936693-884638332954?w=500'
      },
      {
        serviceCode: 'SRV-APP-AC', name: 'Air Conditioner Jet Servicing',
        category: 'APPLIANCE',
        description: 'High pressure foam wash, filter decontamination, cooling coil cleansing, and gas check.',
        baseLaborPrice: 599,
        defaultDurationMinutes: 75,
        isActive: true,
        imageUrl: 'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=500'
      },
      {
        serviceCode: 'SRV-CLEAN-HOME', name: 'Full Home Deep Sanitization & Cleaning',
        category: 'CLEANING',
        description: 'Intense scrubbing, vacuuming, window track cleaning, floor buffing and germ shield.',
        baseLaborPrice: 1299,
        defaultDurationMinutes: 180,
        isActive: true,
        imageUrl: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=500'
      },
      {
        serviceCode: 'SRV-CLEAN-BATH', name: 'Intense Bathroom Descaling',
        category: 'CLEANING',
        description: 'Deep acid-safe stain removal on tiles, glass partitions, fittings, and commodes.',
        baseLaborPrice: 499,
        defaultDurationMinutes: 60,
        isActive: true,
        imageUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=500'
      },
      {
        serviceCode: 'SRV-CARP-LOCK', name: 'Door Lock & Latch Mechanism Repair',
        category: 'CARPENTRY',
        description: 'Alignment, mortise lock installation, cylinder replacement, and hinge greasing.',
        baseLaborPrice: 349,
        defaultDurationMinutes: 45,
        isActive: true,
        imageUrl: 'https://images.unsplash.com/photo-1588854337236-6889d631faa8?w=500'
      },
      {
        serviceCode: 'SRV-ELEC-SOS', name: 'Emergency SOS Short Circuit Repair',
        category: 'ELECTRICAL',
        description: 'Rapid dispatch cooperative electrical emergency triage for sparks, smoke, or total blackout.',
        baseLaborPrice: 699,
        defaultDurationMinutes: 30,
        isActive: true,
        imageUrl: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=500'
      }
    ]);

    // 5. Admin Users
    const passwordHash = await bcrypt.hash('admin123', 10);

    const superAdmin = await User.create({
      mobileNumber: '+919999900001',
      fullName: 'Super Administrator',
      email: 'admin@gigsevak.coop',
      passwordHash,
      role: 'PLATFORM_SUPER_ADMIN',
      status: 'ACTIVE'
    });

    const societyAdmin = await User.create({
      mobileNumber: '+919999900002',
      fullName: 'Vikram Sharma (Society Admin)',
      email: 'vikram@gigsevak.coop',
      passwordHash,
      role: 'SOCIETY_ADMIN',
      societyId: society1._id,
      federationId: federation._id,
      status: 'ACTIVE'
    });

    // 6. Test Customers
    const customer1 = await User.create({
      mobileNumber: '+919876543210',
      fullName: 'Priya Narang',
      email: 'priya@gmail.com',
      role: 'CUSTOMER',
      status: 'ACTIVE',
      addresses: [{
        addressId: 'addr-01',
        label: 'HOME',
        addressLine1: 'Flat 402, Royal Palms, Saket',
        city: 'New Delhi',
        state: 'Delhi',
        postalCode: '110017',
        location: { type: 'Point', coordinates: [77.2060, 28.5244] },
        isDefault: true
      }]
    });

    // 7. Workers
    const workerUser1 = await User.create({
      mobileNumber: '+919811100001',
      fullName: 'Rajesh Kumar',
      role: 'WORKER',
      status: 'ACTIVE'
    });

    const worker1 = await Worker.create({
      userId: workerUser1._id,
      workerCode: 'WK-DEL-001',
      societyId: society1._id,
      federationId: federation._id,
      primaryRegionId: region1._id,
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

    await WorkerPrivate.create({
      workerId: worker1._id,
      userId: workerUser1._id,
      mobileNumberFull: '+919811100001',
      mobileNumberMasked: '+91 98111Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢',
      aadhaarNumberMasked: 'Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢ Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢ 1234',
      panNumber: 'ABCDE1234F',
      bankAccount: {
        accountHolderName: 'Rajesh Kumar',
        accountNumberMasked: 'Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢4321',
        ifscCode: 'SBIN0001111',
        bankName: 'SBI',
        payoutMode: 'UPI',
        upiId: 'rajesh@okhdfcbank',
        isVerified: true
      },
      emergencyContact: {
        name: 'Sunita Kumar',
        relationship: 'Wife',
        mobileNumber: '+919811100099'
      },
      earnings: {
        totalLifetimeEarnings: 84500,
        currentMonthEarnings: 18200
      }
    });

    const workerUser2 = await User.create({
      mobileNumber: '+919811100002',
      fullName: 'Sunita Sharma',
      role: 'WORKER',
      status: 'ACTIVE'
    });

    const worker2 = await Worker.create({
      userId: workerUser2._id,
      workerCode: 'WK-DEL-002',
      societyId: society1._id,
      federationId: federation._id,
      primaryRegionId: region1._id,
      fullName: 'Sunita Sharma',
      avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400',
      gender: 'FEMALE',
      languagesSpoken: ['Hindi'],
      primaryServiceCategory: 'CLEANING',
      experienceTier: 'SENIOR',
      availabilityStatus: 'AVAILABLE',
      isOnline: true,
      currentLocation: { type: 'Point', coordinates: [77.2000, 28.5400] },
      kycVerificationStatus: 'VERIFIED',
      membershipStatus: 'ACTIVE_MEMBER',
      shareholderFolioNumber: 'COOP-SH-1002',
      metrics: {
        averageRating: 4.8,
        reviewCount: 96,
        completedJobsCount: 120,
        acceptanceRate: 95,
        cancellationRate: 2,
        trustScore: 92
      }
    });

    // A worker pending verification (for admin approval tests)
    const workerUser3 = await User.create({
      mobileNumber: '+919811100003',
      fullName: 'Manoj Singh',
      role: 'WORKER',
      status: 'ACTIVE'
    });

    const worker3 = await Worker.create({
      userId: workerUser3._id,
      workerCode: 'WK-DEL-003',
      societyId: society2._id,
      federationId: federation._id,
      primaryRegionId: region1._id,
      fullName: 'Manoj Singh',
      gender: 'MALE',
      languagesSpoken: ['Hindi'],
      primaryServiceCategory: 'PLUMBING',
      experienceTier: 'STANDARD',
      availabilityStatus: 'OFF_DUTY',
      isOnline: false,
      kycVerificationStatus: 'PENDING',
      membershipStatus: 'APPLICANT'
    });

    await WorkerPrivate.create({
      workerId: worker3._id,
      userId: workerUser3._id,
      mobileNumberFull: '+919811100003',
      mobileNumberMasked: '+91 98111Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢',
      aadhaarNumberMasked: 'Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢ Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢ 9999',
      panNumber: 'PLUMB1234Z'
    });

    console.log('[Seed] Database seeded successfully with canonical data!');
    if (standalone) {
      process.exit(0);
    }
  } catch (err) {
    console.error('[Seed] Error seeding database:', err);
    if (standalone) {
      process.exit(1);
    }
  }
}

if (require.main === module) {
  seed(true);
}

module.exports = { seed };