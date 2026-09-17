const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function runCompletionPinTest() {
  console.log('====================================================');
  console.log('  TESTING JOB-COMPLETION PIN FLOW (MongoDB Backend) ');
  console.log('====================================================');
  const baseUrl = 'http://localhost:5000/api';

  // 1. Customer login
  const custRes = await fetch(`${baseUrl}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mobileNumber: '+919812345678',
      role: 'CUSTOMER',
      fullName: 'Test Customer'
    })
  });
  const custData = await custRes.json();
  const custToken = custData.data?.accessToken;
  const custUser = custData.data?.user;
  console.log('1. Customer logged in:', custUser?._id, custUser?.role);

  // 2. Worker login
  const workerRes = await fetch(`${baseUrl}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mobileNumber: '+919811100001',
      role: 'WORKER'
    })
  });
  const workerData = await workerRes.json();
  const workerToken = workerData.data?.accessToken;
  console.log('2. Worker logged in:', workerData.data?.user?._id);

  // 3. Find service & worker profile
  const services = await fetch(`${baseUrl}/services`).then(r => r.json());
  const workers = await fetch(`${baseUrl}/workers`).then(r => r.json());
  const service = services.data[0];
  const assignedWorker = workers.data.workers[0];

  // 4. Customer creates booking
  const createRes = await fetch(`${baseUrl}/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${custToken}`
    },
    body: JSON.stringify({
      serviceId: service._id,
      workerId: assignedWorker._id,
      serviceAddress: {
        addressLine1: 'Test Address 123',
        city: 'New Delhi',
        pincode: '110024'
      },
      notes: 'End-to-end completion PIN test'
    })
  });
  const createData = await createRes.json();
  const booking = createData.data?.booking;
  const bookingId = booking._id;
  console.log('3. Booking created:', bookingId, 'Status:', booking.status);

  // 5. Worker accepts booking
  await fetch(`${baseUrl}/bookings/${bookingId}/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${workerToken}` }
  });

  // 6. Worker marks in-transit
  await fetch(`${baseUrl}/bookings/${bookingId}/in-transit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${workerToken}` }
  });

  // 7. Worker marks arrived
  await fetch(`${baseUrl}/bookings/${bookingId}/arrived`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${workerToken}` }
  });

  // 8. Customer fetches start OTP
  const arrivedCust = await fetch(`${baseUrl}/bookings/${bookingId}`, {
    headers: { Authorization: `Bearer ${custToken}` }
  }).then(r => r.json());
  const startOtp = arrivedCust.data?.startOtp;
  console.log('4. Worker ARRIVED. Customer received start OTP:', startOtp);

  // 9. Worker starts job with OTP
  const startJobRes = await fetch(`${baseUrl}/bookings/${bookingId}/start-job`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${workerToken}`
    },
    body: JSON.stringify({ otp: startOtp })
  }).then(r => r.json());
  console.log('5. Worker started job. Current status:', startJobRes.data?.status);
  if (startJobRes.data?.status !== 'IN_PROGRESS') {
    throw new Error(`Expected IN_PROGRESS, got: ${startJobRes.data?.status}`);
  }

  // 10. Worker clicks "Job Completed":
  // Backend verifies worker ownership + IN_PROGRESS, generates 4-digit PIN,
  // saves in MongoDB, sets COMPLETION_PENDING.
  console.log('6. Worker clicks "Job Completed" -> calling POST /complete...');
  const completeRes = await fetch(`${baseUrl}/bookings/${bookingId}/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${workerToken}` }
  });
  const completeData = await completeRes.json();
  console.log('   Response status:', completeRes.status);
  console.log('   Response data:', completeData);
  if (completeData.data?.status !== 'COMPLETION_PENDING') {
    throw new Error(`Expected COMPLETION_PENDING, got: ${completeData.data?.status}`);
  }

  // 11. Verify worker DOES NOT receive the PIN in the completion response
  if (completeData.data?.pin || completeData.data?.completionPin) {
    throw new Error('SECURITY VIOLATION: Worker should not receive completion PIN in API response!');
  }

  // 12. Worker calls GET /bookings/:id - verify PIN is NOT leaked to worker
  const workerView = await fetch(`${baseUrl}/bookings/${bookingId}`, {
    headers: { Authorization: `Bearer ${workerToken}` }
  }).then(r => r.json());
  if (workerView.data?.completionPin || workerView.data?.security?.completionPin) {
    throw new Error('SECURITY VIOLATION: Worker should not see completion PIN in GET /bookings/:id!');
  }
  console.log('7. Security check PASSED: Worker cannot see completion PIN via API.');

  // 13. Customer tracking page polls GET /bookings/:id:
  // Customer receives the newly generated 4-digit completion PIN
  const custView = await fetch(`${baseUrl}/bookings/${bookingId}`, {
    headers: { Authorization: `Bearer ${custToken}` }
  }).then(r => r.json());
  const customerPin = custView.data?.completionPin;
  console.log('8. Customer fetched booking. Status:', custView.data?.status);
  console.log('   Customer received Completion PIN:', customerPin);
  if (!customerPin || customerPin.length !== 4) {
    throw new Error(`Expected valid 4-digit completion PIN for customer, got: ${customerPin}`);
  }

  // 14. Page refresh test: Re-fetch directly from MongoDB to verify persistence
  const custRefreshView = await fetch(`${baseUrl}/bookings/${bookingId}`, {
    headers: { Authorization: `Bearer ${custToken}` }
  }).then(r => r.json());
  if (custRefreshView.data?.completionPin !== customerPin) {
    throw new Error(`PIN did not persist after refresh! Expected ${customerPin}, got ${custRefreshView.data?.completionPin}`);
  }
  console.log('9. Persistence check PASSED: Completion PIN persisted in MongoDB after simulated refresh.');

  // 15. Negative test: Worker submits incorrect PIN
  console.log('10. Testing incorrect PIN submission...');
  const wrongPinRes = await fetch(`${baseUrl}/bookings/${bookingId}/verify-completion`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${workerToken}`
    },
    body: JSON.stringify({ pin: '0000' })
  });
  const wrongPinData = await wrongPinRes.json();
  console.log('    Wrong PIN response status:', wrongPinRes.status, wrongPinData.error?.code);
  if (wrongPinRes.status !== 400 || wrongPinData.error?.code !== 'INVALID_COMPLETION_PIN') {
    throw new Error(`Expected 400 INVALID_COMPLETION_PIN for wrong PIN, got: ${wrongPinRes.status}`);
  }

  // 16. Positive test: Worker submits correct 4-digit PIN given by customer
  console.log('11. Worker submits correct 4-digit PIN:', customerPin);
  const correctPinRes = await fetch(`${baseUrl}/bookings/${bookingId}/verify-completion`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${workerToken}`
    },
    body: JSON.stringify({ pin: customerPin })
  });
  const correctPinData = await correctPinRes.json();
  console.log('    Correct PIN response status:', correctPinRes.status, correctPinData.data?.status);
  if (correctPinData.data?.status !== 'COMPLETED') {
    throw new Error(`Expected COMPLETED, got: ${correctPinData.data?.status}`);
  }

  // 17. Final customer check: Status is now COMPLETED, temporary PIN cleared
  const finalCustView = await fetch(`${baseUrl}/bookings/${bookingId}`, {
    headers: { Authorization: `Bearer ${custToken}` }
  }).then(r => r.json());
  console.log('12. Final booking check. Status:', finalCustView.data?.status);
  console.log('    Temporary completion PIN cleared:', finalCustView.data?.completionPin === null);
  if (finalCustView.data?.status !== 'COMPLETED') {
    throw new Error(`Expected final status COMPLETED, got: ${finalCustView.data?.status}`);
  }

  console.log('\n====================================================');
  console.log('  ALL TESTS PASSED! JOB-COMPLETION FLOW VERIFIED.   ');
  console.log('====================================================\n');
}

runCompletionPinTest().catch(err => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});
