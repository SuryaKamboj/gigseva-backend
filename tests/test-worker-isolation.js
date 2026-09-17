const BASE_URL = 'http://localhost:5000/api';

async function request(method, path, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = json;
    throw err;
  }
  return json;
}

async function main() {
  console.log('--- STARTING WORKER BOOKING REQUEST & ISOLATION TEST ---');

  // 1. Authenticate Customer
  console.log('1. Authenticating Customer...');
  const customerAuth = await request('POST', '/auth/verify-otp', {
    mobileNumber: '+919876543210',
    role: 'CUSTOMER',
    fullName: 'Test Citizen Customer'
  });
  const customerToken = customerAuth.data.accessToken || customerAuth.data.token;
  console.log('   Customer Token acquired.');

  // 2. Authenticate Worker A (Rajesh Kumar)
  console.log('2. Authenticating Worker A (Rajesh Kumar)...');
  const workerAAuth = await request('POST', '/auth/verify-otp', {
    mobileNumber: '+919811100001',
    role: 'WORKER',
    fullName: 'Rajesh Kumar'
  });
  const workerAToken = workerAAuth.data.accessToken || workerAAuth.data.token;
  const workerAProfile = await request('GET', '/workers/me', null, workerAToken);
  const workerAId = workerAProfile.data.workerId || workerAProfile.data._id;
  console.log(`   Worker A ID: ${workerAId} (${workerAProfile.data.fullName})`);

  // 3. Authenticate Worker B (Ramesh Sharma)
  console.log('3. Authenticating Worker B (Ramesh Sharma)...');
  const workerBAuth = await request('POST', '/auth/verify-otp', {
    mobileNumber: '+919811100002',
    role: 'WORKER',
    fullName: 'Ramesh Sharma'
  });
  const workerBToken = workerBAuth.data.accessToken || workerBAuth.data.token;
  const workerBProfile = await request('GET', '/workers/me', null, workerBToken);
  const workerBId = workerBProfile.data.workerId || workerBProfile.data._id;
  console.log(`   Worker B ID: ${workerBId} (${workerBProfile.data.fullName})`);

  // 4. Target Service
  const servicesRes = await request('GET', '/services');
  const service = servicesRes.data[0];
  console.log(`4. Target Service: ${service.name} (${service._id})`);

  // 5. Customer creates booking specifically for Worker A
  console.log('5. Creating booking for Worker A...');
  const bookingRes = await request('POST', '/bookings', {
    serviceId: service._id,
    workerId: workerAId,
    serviceAddress: {
      addressLine1: 'Flat 402, Lotus Apartments',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110001',
      location: { type: 'Point', coordinates: [77.2090, 28.6139] }
    },
    scheduledStartTime: new Date(Date.now() + 3600000).toISOString(),
    notes: 'Urgent wiring fix needed'
  }, customerToken);

  const bookingA = bookingRes.data.booking;
  console.log(`   Booking created: ${bookingA.bookingCode} (MongoDB _id: ${bookingA._id}, Status: ${bookingA.status})`);
  if (bookingA.status !== 'PENDING') {
    throw new Error(`Expected status PENDING, got ${bookingA.status}`);
  }

  // 6. Worker A fetches jobs -> Must see bookingA
  console.log("6. Verifying booking appears in Worker A's dashboard...");
  const workerAJobs = await request('GET', '/workers/me/jobs', null, workerAToken);
  const foundInA = workerAJobs.data.find(j => j._id === bookingA._id || j.bookingCode === bookingA.bookingCode);
  if (!foundInA) {
    throw new Error(`Booking ${bookingA.bookingCode} NOT found in Worker A jobs!`);
  }
  console.log(`   SUCCESS: Booking found in Worker A jobs list!`);
  console.log(`   Details: Client=${foundInA.userId?.fullName}, Phone=${foundInA.userId?.mobileNumber}, Status=${foundInA.status}`);

  // 7. Worker B fetches jobs -> Must NOT see bookingA
  console.log("7. Verifying booking does NOT appear in Worker B's dashboard (Cross-Worker Isolation)...");
  const workerBJobs = await request('GET', '/workers/me/jobs', null, workerBToken);
  const foundInB = workerBJobs.data.find(j => j._id === bookingA._id || j.bookingCode === bookingA.bookingCode);
  if (foundInB) {
    throw new Error(`ISOLATION LEAK: Booking ${bookingA.bookingCode} appeared in Worker B jobs!`);
  }
  console.log(`   SUCCESS: Booking correctly isolated; Worker B cannot see Worker A's booking.`);

  // 8. Worker B tries to accept Worker A's booking -> Must get 403 Forbidden
  console.log("8. Testing security: Worker B tries to accept Worker A's booking...");
  try {
    await request('POST', `/bookings/${bookingA._id}/accept`, {}, workerBToken);
    throw new Error('SECURITY BREACH: Worker B was allowed to accept Worker A booking!');
  } catch (err) {
    if (err.status === 403 || err.status === 404) {
      console.log(`   SUCCESS: Worker B blocked with ${err.status} (${err.data?.error?.message || err.message})`);
    } else {
      throw err;
    }
  }

  // 9. Worker A accepts booking -> Must succeed and persist status ACCEPTED
  console.log("9. Worker A accepts booking...");
  const acceptRes = await request('POST', `/bookings/${bookingA._id}/accept`, {}, workerAToken);
  console.log(`   Accept response: Status=${acceptRes.data.status}`);
  if (acceptRes.data.status !== 'ACCEPTED') {
    throw new Error(`Expected status ACCEPTED, got ${acceptRes.data.status}`);
  }

  // Verify in Worker A jobs
  const workerAJobsAfterAccept = await request('GET', '/workers/me/jobs', null, workerAToken);
  const acceptedJobInA = workerAJobsAfterAccept.data.find(j => j._id === bookingA._id);
  console.log(`   Status in Worker A jobs list: ${acceptedJobInA.status}`);
  if (acceptedJobInA.status !== 'ACCEPTED') {
    throw new Error(`Expected status ACCEPTED in Worker A jobs, got ${acceptedJobInA.status}`);
  }

  // 10. Customer creates another booking for Worker A to test Decline flow
  console.log('10. Creating second booking for Worker A to test Decline flow...');
  const booking2Res = await request('POST', '/bookings', {
    serviceId: service._id,
    workerId: workerAId,
    serviceAddress: {
      addressLine1: 'House 88, Sector 14',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110001'
    },
    scheduledStartTime: new Date(Date.now() + 7200000).toISOString(),
    notes: 'Switchboard sparking'
  }, customerToken);

  const booking2 = booking2Res.data.booking;
  console.log(`    Second booking created: ${booking2.bookingCode} (Status: ${booking2.status})`);

  // Verify it appears in Worker A's pending list
  const workerAJobsBeforeDecline = await request('GET', '/workers/me/jobs', null, workerAToken);
  const found2InA = workerAJobsBeforeDecline.data.find(j => j._id === booking2._id);
  if (!found2InA) {
    throw new Error(`Second booking ${booking2.bookingCode} not in Worker A list!`);
  }
  console.log(`    Second booking visible to Worker A with status: ${found2InA.status}`);

  // 11. Worker A declines second booking
  console.log('11. Worker A declines second booking...');
  const declineRes = await request('POST', `/bookings/${booking2._id}/decline`, {
    reason: 'Schedule conflict'
  }, workerAToken);
  console.log(`    Decline response: Status=${declineRes.data.status}`);

  // Verify second booking is no longer returned in Worker A's jobs list
  const workerAJobsAfterDecline = await request('GET', '/workers/me/jobs', null, workerAToken);
  const found2AfterDecline = workerAJobsAfterDecline.data.find(j => j._id === booking2._id);
  if (found2AfterDecline) {
    throw new Error(`Booking ${booking2.bookingCode} still present in Worker A jobs after decline!`);
  }
  console.log(`    SUCCESS: Declined booking completely removed from Worker A pending jobs list!`);

  console.log('\n--- ALL WORKER BOOKING & ISOLATION TESTS PASSED PERFECTLY! ---');
}

main().catch(err => {
  console.error('TEST FAILED:', err.data || err.message || err);
  process.exit(1);
});
