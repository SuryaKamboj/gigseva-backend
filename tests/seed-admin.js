const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const User = require('../src/models/User');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const passwordHash = await bcrypt.hash('admin123', 10);

  let admin = await User.findOne({ email: 'admin@gigsevak.coop' });
  if (!admin) {
    admin = new User({
      mobileNumber: '+919999900001',
      fullName: 'Super Administrator',
      email: 'admin@gigsevak.coop',
      passwordHash,
      role: 'PLATFORM_SUPER_ADMIN'
    });
    await admin.save();
    console.log('Created admin@gigsevak.coop');
  } else {
    admin.passwordHash = passwordHash;
    admin.role = 'PLATFORM_SUPER_ADMIN';
    await admin.save();
    console.log('Updated admin@gigsevak.coop password');
  }

  // Also ensure customer +919876543210 has role CUSTOMER for test consistency
  let cust = await User.findOne({ mobileNumber: '+919876543210' });
  if (cust) {
    cust.role = 'CUSTOMER';
    await cust.save();
    console.log('Set +919876543210 to CUSTOMER');
  }

  await mongoose.disconnect();
})();
