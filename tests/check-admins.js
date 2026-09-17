const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../src/models/User');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const u = await User.find({ role: { $in: ['PLATFORM_SUPER_ADMIN', 'SYSTEM_ADMIN', 'SOCIETY_ADMIN'] } });
  console.log('Admins found:', u.length);
  u.forEach(user => console.log(user._id, user.email, user.mobileNumber, user.role));
  await mongoose.disconnect();
})();
