// End-to-End Inter-Service Verification Test
const http = require('http');

async function apiRequest(path, method = 'GET', body = null, token = null) {
  const url = `http://localhost:5000/api${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runE2ETest() {
  console.log('\n=============================================');
  console.log('STARTING GIGSEVAK END-TO-END FLOW TEST');
  console.log('=============================================\n');

  // 1. Health check
  console.log('STEP 1: Backend Health Check...');
  const health = await apiRequest('/health');
  if (!health.ok) {
    throw new Error(`Health check failed: ${JSON.stringify(health)}`);
  }
  console.log('✓ Health Check OK:', health.data.status, 'DB:', health.data.database.status);

  // 2. Authenticate Customer (User Frontend)
  console.log('\nSTEP 2: Customer Authentication (user-frontend)...');
  const userAuth = await apiRequest('/auth/verify-otp', 'POST', {
    mobileNumber: '+919876543210',
    role: 'CUSTOMER',
    fullName: 'Priya Narang'
  });
  if (!userAuth.ok || !userAuth.data?.data?.accessToken) {
    throw new Error(`Customer auth failed: ${JSON.stringify(userAuth)}`);
  }
  const customerToken = userAuth.data.data.accessToken;
  console.log('✓ Customer Authenticated! Token received. User ID:', userAuth.data.data.user?.userId);

  // 3. User sends booking request
  console.log('\nSTEP 3: User initiates booking request (POST /api/bookings)...');
  const bookingPayload = {
    serviceId: '6aa307c8abef287d06eb41fe', // Canonical electrical repair
    workerId: '6aa307c9abef287d06eb4213',  // Canonical worker Rajesh Kumar
    notes: 'Urgent: Circuit breaker tripping in living room',
    serviceAddress: {
      addressLine1: 'B-42 Lajpat Nagar II',
      city: 'New Delhi',
      state: 'Delhi',
      pincode: '110024'
    }
  };
  const bookingRes = await apiRequest('/bookings', 'POST', bookingPayload, customerToken);
  if (!bookingRes.ok || !bookingRes.data?.data?.booking) {
    throw new Error(`Booking creation failed: ${JSON.stringify(bookingRes)}`);
  }
  const createdBooking = bookingRes.data.data.booking;
  const bookingId = createdBooking._id;
  const bookingCode = createdBooking.bookingCode;
  console.log(`✓ Booking Created! ID: ${bookingId}, Code: ${bookingCode}, Status: ${createdBooking.status}`);

  // 4. Authenticate Worker (Worker Frontend)
  console.log('\nSTEP 4: Worker Authentication (worker-frontend)...');
  const workerAuth = await apiRequest('/auth/verify-otp', 'POST', {
    mobileNumber: '+919811100001',
    role: 'WORKER',
    fullName: 'Rajesh Kumar'
  });
  if (!workerAuth.ok || !workerAuth.data?.data?.accessToken) {
    throw new Error(`Worker auth failed: ${JSON.stringify(workerAuth)}`);
  }
  const workerToken = workerAuth.data.data.accessToken;
  console.log('✓ Worker Authenticated! Token received. Worker Code:', workerAuth.data.data.user?.workerCode);

  // 5. Worker queries incoming jobs
  console.log('\nSTEP 5: Worker checks incoming jobs (GET /api/workers/me/jobs)...');
  const workerJobs = await apiRequest('/workers/me/jobs', 'GET', null, workerToken);
  if (!workerJobs.ok || !Array.isArray(workerJobs.data?.data)) {
    throw new Error(`Failed to fetch worker jobs: ${JSON.stringify(workerJobs)}`);
  }
  const foundInWorkerJobs = workerJobs.data.data.find(j => j._id === bookingId || j.bookingCode === bookingCode);
  if (!foundInWorkerJobs) {
    throw new Error(`Booking ${bookingCode} not found in worker incoming jobs queue!`);
  }
  console.log(`✓ Worker sees incoming booking! Status: ${foundInWorkerJobs.status}, Service: ${foundInWorkerJobs.serviceId?.name}`);

  // 6. Worker accepts the booking
  console.log('\nSTEP 6: Worker accepts the booking (POST /api/bookings/:id/accept)...');
  const acceptRes = await apiRequest(`/bookings/${bookingId}/accept`, 'POST', {}, workerToken);
  if (!acceptRes.ok || !acceptRes.data?.data) {
    throw new Error(`Worker failed to accept booking: ${JSON.stringify(acceptRes)}`);
  }
  const acceptedBooking = acceptRes.data.data;
  console.log(`✓ Worker accepted booking! New Status: ${acceptedBooking.status}`);

  // 7. Admin Authenticates & checks booking details (Admin Frontend)
  console.log('\nSTEP 7: Admin Authentication (admin-frontend)...');
  const adminAuth = await apiRequest('/auth/admin/login', 'POST', {
    userId: 'admin@gigsevak.coop',
    password: 'admin123'
  });
  if (!adminAuth.ok || !adminAuth.data?.data?.accessToken) {
    throw new Error(`Admin login failed: ${JSON.stringify(adminAuth)}`);
  }
  const adminToken = adminAuth.data.data.accessToken;
  console.log('✓ Admin Authenticated! Role:', adminAuth.data.data.user?.role);

  // 8. Admin queries all bookings
  console.log('\nSTEP 8: Admin checks job details in Job Management (GET /api/admin/bookings)...');
  const adminBookings = await apiRequest('/admin/bookings', 'GET', null, adminToken);
  if (!adminBookings.ok || !Array.isArray(adminBookings.data?.data)) {
    throw new Error(`Admin failed to fetch bookings: ${JSON.stringify(adminBookings)}`);
  }
  const adminJob = adminBookings.data.data.find(b => b._id === bookingId || b.bookingCode === bookingCode);
  if (!adminJob) {
    throw new Error(`Admin cannot find booking ${bookingCode} in admin bookings list!`);
  }
  console.log('✓ Booking found in Admin Job Management!');
  console.log({
    bookingCode: adminJob.bookingCode,
    status: adminJob.status,
    customer: adminJob.userId?.fullName,
    customerMobile: adminJob.userId?.mobileNumber,
    worker: adminJob.workerId?.fullName,
    service: adminJob.serviceId?.name,
    amount: adminJob.pricing?.totalAmount
  });

  console.log('\n=============================================');
  console.log('ALL TESTS PASSED SUCCESSFULLY! FULL PIPELINE VERIFIED!');
  console.log('=============================================\n');
}

runE2ETest().catch(err => {
  console.error('\n❌ E2E TEST FAILED:', err.message);
  process.exit(1);
});
