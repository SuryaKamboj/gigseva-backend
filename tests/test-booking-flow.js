const fetch = require('node-fetch');

async function testBookingFlow() {
  console.log('--- Testing Real MongoDB Booking Flow ---');
  const baseUrl = 'http://localhost:5000/api';

  // 1. Customer login
  const custLogin = await fetch(`${baseUrl}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mobileNumber: '+919812345678',
      role: 'CUSTOMER',
      fullName: 'Test Customer'
    })
  }).then(r => r.json());

  console.log('1. Customer login:', custLogin.success, custLogin.data?.user?.fullName, custLogin.data?.user?.role);
  const custToken = custLogin.data?.accessToken;
  const custUser = custLogin.data?.user;

  // 2. Fetch services & workers
  const services = await fetch(`${baseUrl}/services`).then(r => r.json());
  const workers = await fetch(`${baseUrl}/workers`).then(r => r.json());

  const service = services.data[0];
  const worker = workers.data.workers[0];

  console.log('2. Selected Service:', service._id, service.name);
  console.log('   Selected Worker:', worker._id, worker.fullName);

  // 3. Create Real Booking
  const createRes = await fetch(`${baseUrl}/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${custToken}`
    },
    body: JSON.stringify({
      serviceId: service._id,
      workerId: worker._id,
      serviceAddress: {
        addressLine1: 'B-42 Lajpat Nagar II',
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110024'
      },
      notes: 'Real MongoDB flow test'
    })
  });

  const createData = await createRes.json();
  console.log('3. Create Booking Status:', createRes.status);
  const booking = createData.data?.booking;
  console.log('   Booking ID/Code:', booking?.bookingCode, booking?.bookingId);
  console.log('   Booking Status:', booking?.status);
  console.log('   User ID linked:', booking?.userId);
  console.log('   Worker ID linked:', booking?.workerId);

  if (booking?.status !== 'PENDING') {
    throw new Error(`Expected status PENDING, got: ${booking?.status}`);
  }
  if (!booking?.bookingId || booking?.bookingId !== booking?.bookingCode) {
    throw new Error(`Expected bookingId to equal bookingCode: ${booking?.bookingCode}`);
  }
  if (booking?.userId !== custUser._id && booking?.userId !== custUser.userId) {
    throw new Error(`Expected userId to match customer: ${custUser._id}`);
  }
  if (booking?.workerId !== worker._id) {
    throw new Error(`Expected workerId to match worker: ${worker._id}`);
  }

  // 4. Retrieve Booking via GET /api/bookings/:id
  const getRes = await fetch(`${baseUrl}/bookings/${booking._id}`, {
    headers: { Authorization: `Bearer ${custToken}` }
  });
  const getData = await getRes.json();
  console.log('4. GET /api/bookings/:id Status:', getRes.status, getData.data?.status);

  // 5. Worker Accept Booking
  const workerLogin = await fetch(`${baseUrl}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mobileNumber: '+919811100001',
      role: 'WORKER'
    })
  }).then(r => r.json());

  const workerToken = workerLogin.data?.accessToken;
  const acceptRes = await fetch(`${baseUrl}/bookings/${booking._id}/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${workerToken}` }
  });
  const acceptData = await acceptRes.json();
  console.log('5. Worker Accept Status:', acceptRes.status, acceptData.data?.status);

  if (acceptData.data?.status !== 'ACCEPTED') {
    throw new Error(`Expected status ACCEPTED after accept, got: ${acceptData.data?.status}`);
  }

  console.log('--- ALL BACKEND BOOKING FLOW VERIFICATIONS PASSED ---');
}

testBookingFlow().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
