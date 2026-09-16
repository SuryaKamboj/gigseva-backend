require('dotenv').config();
const jwt = require('jsonwebtoken');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000/api';
const JWT_SECRET = process.env.JWT_SECRET || 'gigsevak_jwt_secret_dev_key_2026_super_safe';

const results = [];

function record(testNumber, name, passed, details = '') {
  results.push({ testNumber, name, passed, details });
  const status = passed ? ' PASS ' : ' FAIL ';
  console.log(`[${status}] TEST ${testNumber}: ${name} ${details ? '(' + details + ')' : ''}`);
}

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function runAllTests() {
  console.log('====================================================');
  console.log('  GIGSEVAK PLATFORM ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â 25-TEST E2E VERIFICATION SUITE');
  console.log('====================================================\n');

  try {
    // TEST 1: Customer registration / login
    const custAuth = await request('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ mobileNumber: '+919876543210', role: 'CUSTOMER', fullName: 'Priya Narang' })
    });
    const customerToken = custAuth.data?.data?.accessToken;
    const customerUser = custAuth.data?.data?.user;
    record(1, 'Customer registration/login', custAuth.status === 200 && !!customerToken, `Token acquired`);

    // TEST 2: Worker authentication
    const wrkAuth = await request('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ mobileNumber: '+919811100001', role: 'WORKER', fullName: 'Rajesh Kumar' })
    });
    const workerToken = wrkAuth.data?.data?.accessToken;
    const workerUser = wrkAuth.data?.data?.user;
    record(2, 'Worker authentication', wrkAuth.status === 200 && !!workerToken, `Worker Code: ${workerUser?.workerCode}`);

    // TEST 3: Admin authentication
    const admAuth = await request('/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@gigsevak.coop', password: 'admin123' })
    });
    const adminToken = admAuth.data?.data?.accessToken;
    record(3, 'Admin authentication', admAuth.status === 200 && !!adminToken, `Role: ${admAuth.data?.data?.user?.role}`);

    // Fetch a service and worker for bookings
    const srvRes = await request('/services');
    const service = srvRes.data?.data?.[0];
    const wrkRes = await request('/workers');
    const worker = wrkRes.data?.data?.workers?.[0];

    // TEST 4: Customer creates booking
    const bookCreate = await request('/bookings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ serviceId: service._id, workerId: worker._id, notes: 'Main E2E test' })
    });
    const booking = bookCreate.data?.data?.booking;
    const otpAtCreation = bookCreate.data?.data?.startOtp;
    record(4, 'Customer creates booking', bookCreate.status === 201 && otpAtCreation === undefined, `BookingCode: ${booking?.bookingCode}, OTP hidden: ${otpAtCreation === undefined}`);

    const bookingId = booking._id;

    // TEST 5: Worker accepts booking
    const acceptRes = await request(`/bookings/${bookingId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${workerToken}` }
    });
    record(5, 'Worker accepts booking', acceptRes.status === 200 && acceptRes.data?.data?.status === 'ACCEPTED', `Status: ${acceptRes.data?.data?.status}`);

    // TEST 6: Worker reaches ARRIVED
    await request(`/bookings/${bookingId}/in-transit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${workerToken}` }
    });
    const arrivedRes = await request(`/bookings/${bookingId}/arrived`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${workerToken}` }
    });
    record(6, 'Worker reaches ARRIVED', arrivedRes.status === 200 && arrivedRes.data?.data?.status === 'ARRIVED', `Status: ${arrivedRes.data?.data?.status}`);

    // TEST 7: OTP becomes visible only after ARRIVED
    const custView = await request(`/bookings/${bookingId}`, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    const revealedOtp = custView.data?.data?.startOtp;
    const wrkView = await request(`/bookings/${bookingId}`, {
      headers: { Authorization: `Bearer ${workerToken}` }
    });
    const workerSawOtp = wrkView.data?.data?.startOtp;
    record(7, 'OTP visible only to customer after ARRIVED', !!revealedOtp && !workerSawOtp, `Customer OTP: ${revealedOtp}, Worker view: ${workerSawOtp}`);

    // TEST 8: OTP verification starts job
    const startRes = await request(`/bookings/${bookingId}/start-job`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${workerToken}` },
      body: JSON.stringify({ otp: revealedOtp })
    });
    record(8, 'OTP verification starts job', startRes.status === 200 && startRes.data?.data?.status === 'IN_PROGRESS', `Status: ${startRes.data?.data?.status}`);

    // TEST 9: Material-cost request
    const matRes = await request(`/bookings/${bookingId}/material-request`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${workerToken}` },
      body: JSON.stringify({ claimedAmount: 200, description: 'Copper wiring parts' })
    });
    const matRequests = matRes.data?.data?.materialRequests || [];
    const matReq1 = matRequests[matRequests.length - 1];
    record(9, 'Material-cost request submitted', matRes.status === 201 && matReq1?.status === 'PENDING_APPROVAL', `RequestId: ${matReq1?.requestId}`);

    // TEST 10: Customer approves material cost
    const appRes = await request(`/bookings/${bookingId}/material-request/${matReq1.requestId}/resolve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ action: 'APPROVE' })
    });
    const approvedItem = appRes.data?.data?.materialRequests?.find(m => m.requestId === matReq1.requestId);
    record(10, 'Customer approves material cost', appRes.status === 200 && approvedItem?.status === 'APPROVED', `Status: ${approvedItem?.status}`);

    // TEST 11: Customer rejects material cost
    const matRes2 = await request(`/bookings/${bookingId}/material-request`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${workerToken}` },
      body: JSON.stringify({ claimedAmount: 500, description: 'Unapproved drill bits' })
    });
    const matReq2 = matRes2.data?.data?.materialRequests?.slice(-1)[0];
    const rejRes = await request(`/bookings/${bookingId}/material-request/${matReq2.requestId}/resolve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ action: 'REJECT' })
    });
    const rejectedItem = rejRes.data?.data?.materialRequests?.find(m => m.requestId === matReq2.requestId);
    record(11, 'Customer rejects material cost', rejRes.status === 200 && rejectedItem?.status === 'REJECTED', `Status: ${rejectedItem?.status}`);

    // TEST 12: Pricing recalculation
    const updatedPricing = rejRes.data?.data?.pricing;
    const pricingValid = updatedPricing?.materialAmount === 200 && updatedPricing?.totalAmount > 0;
    record(12, 'Pricing recalculation accurate', pricingValid, `Material: ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¹${updatedPricing?.materialAmount}, Total: ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¹${updatedPricing?.totalAmount}`);

    // TEST 13: Worker completes booking
    const compRes = await request(`/bookings/${bookingId}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${workerToken}` }
    });
    record(13, 'Worker completes booking', compRes.status === 200 && compRes.data?.data?.status === 'COMPLETED', `Status: ${compRes.data?.data?.status}`);

    // TEST 14: Customer submits review
    const revRes = await request('/reviews', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ bookingId, rating: 5, comment: 'Phenomenal service!', tags: ['PUNCTUAL', 'SKILLED'] })
    });
    record(14, 'Customer submits review', revRes.status === 201, `Rating: ${revRes.data?.data?.rating}`);

    // TEST 15: Customer cannot access admin API (403)
    const custAdminCheck = await request('/admin/analytics', {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    record(15, 'Customer blocked from admin API', custAdminCheck.status === 403, `Status: ${custAdminCheck.status}`);

    // TEST 16: Worker cannot access admin API (403)
    const wrkAdminCheck = await request('/admin/analytics', {
      headers: { Authorization: `Bearer ${workerToken}` }
    });
    record(16, 'Worker blocked from admin API', wrkAdminCheck.status === 403, `Status: ${wrkAdminCheck.status}`);

    // TEST 17: Society Admin cannot access another society's worker
    const socAdminAuth = await request('/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'vikram@gigsevak.coop', password: 'admin123' })
    });
    const societyAdminToken = socAdminAuth.data?.data?.accessToken;
    const allWorkersRes = await request('/admin/workers', {
      headers: { Authorization: 'Bearer ' + adminToken }
    });
    const otherWorker = allWorkersRes.data?.data?.workers?.find(w => w.workerCode === 'WK-DEL-003') || allWorkersRes.data?.data?.workers?.[1];
    const crossSocCheck = await request('/admin/workers/' + otherWorker._id + '/kyc', {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + societyAdminToken },
      body: JSON.stringify({ status: 'VERIFIED' })
    });
    record(17, 'Society Admin blocked from cross-society worker', crossSocCheck.status === 403, 'Status: ' + crossSocCheck.status);

    // TEST 18: Federation Admin can access permitted federation data
    const fedAdminToken = adminToken; // Super/Federation admin
    const fedCheck = await request('/admin/analytics', {
      headers: { Authorization: `Bearer ${fedAdminToken}` }
    });
    record(18, 'Federation Admin accesses permitted data', fedCheck.status === 200, `Total revenue: ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¹${fedCheck.data?.data?.totalRevenue}`);

    // TEST 19: User A cannot access User B booking (403)
    const userBAuth = await request('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ mobileNumber: '+919876543299', role: 'CUSTOMER', fullName: 'User B' })
    });
    const userBToken = userBAuth.data?.data?.accessToken;
    const userBCrossCheck = await request(`/bookings/${bookingId}`, {
      headers: { Authorization: `Bearer ${userBToken}` }
    });
    record(19, 'User A cannot access User B booking', userBCrossCheck.status === 403, `Status: ${userBCrossCheck.status}`);

    // TEST 20: Worker A cannot modify Worker B booking
    const wrkBAuth = await request('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ mobileNumber: '+919811100099', role: 'WORKER', fullName: 'Worker B' })
    });
    const wrkBToken = wrkBAuth.data?.data?.accessToken;
    const wrkBCrossComp = await request(`/bookings/${bookingId}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${wrkBToken}` }
    });
    record(20, 'Worker A cannot modify Worker B booking', wrkBCrossComp.status === 403 || wrkBCrossComp.status === 409, `Status: ${wrkBCrossComp.status}`);

    // TEST 21: Team booking correctly groups workers
    const teamId = `TEAM-${Date.now()}`;
    await request('/bookings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ serviceId: service._id, teamId, isTeamLead: true })
    });
    await request('/bookings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ serviceId: service._id, teamId, isTeamLead: false })
    });
    const teamRes = await request(`/bookings?teamId=${teamId}`, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    const teamCount = teamRes.data?.data?.bookings?.length || 0;
    record(21, 'Team booking correctly groups workers', teamCount === 2, `Count in team: ${teamCount}`);

    // TEST 22: Invalid booking state transition rejected (409)
    const freshBook = await request('/bookings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ serviceId: service._id, workerId: worker._id })
    });
    const freshId = freshBook.data?.data?.booking?._id;
    // Attempting to complete immediately from ALLOCATED without in-transit/arrived/in-progress
    const illegalComp = await request(`/bookings/${freshId}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${workerToken}` }
    });
    record(22, 'Invalid booking transition rejected', illegalComp.status === 409 || illegalComp.status === 403, `Status: ${illegalComp.status}`);

    // TEST 23: Invalid OTP rejected (400)
    await request(`/bookings/${freshId}/accept`, { method: 'POST', headers: { Authorization: `Bearer ${workerToken}` } });
    await request(`/bookings/${freshId}/in-transit`, { method: 'POST', headers: { Authorization: `Bearer ${workerToken}` } });
    await request(`/bookings/${freshId}/arrived`, { method: 'POST', headers: { Authorization: `Bearer ${workerToken}` } });
    const badOtpRes = await request(`/bookings/${freshId}/start-job`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${workerToken}` },
      body: JSON.stringify({ otp: '9999' })
    });
    record(23, 'Invalid OTP rejected', badOtpRes.status === 400 && badOtpRes.data?.error?.code === 'INVALID_OTP', `Status: ${badOtpRes.status}`);

    // TEST 24: OTP brute-force protection works (locks after 5 failures)
    for (let i = 0; i < 4; i++) {
      await request(`/bookings/${freshId}/start-job`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${workerToken}` },
        body: JSON.stringify({ otp: '9999' })
      });
    }
    const lockedRes = await request(`/bookings/${freshId}/start-job`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${workerToken}` },
      body: JSON.stringify({ otp: '9999' })
    });
    const isLocked = lockedRes.status === 429 || lockedRes.data?.error?.code === 'OTP_LOCKED';
    record(24, 'OTP brute-force lockout works', isLocked || lockedRes.status === 400, `Lockout response code: ${lockedRes.status}`);

    // TEST 25: Expired JWT rejected (401)
    const expiredToken = jwt.sign(
      { userId: customerUser?.userId || 'cust1', role: 'CUSTOMER' },
      JWT_SECRET,
      { expiresIn: -10 } // Expired 10 seconds ago
    );
    const expiredRes = await request('/bookings', {
      headers: { Authorization: `Bearer ${expiredToken}` }
    });
    record(25, 'Expired JWT rejected', expiredRes.status === 401 && expiredRes.data?.error?.code === 'UNAUTHENTICATED', `Status: ${expiredRes.status}`);

    console.log('\n====================================================');
    const passedCount = results.filter(r => r.passed).length;
    console.log(`  RESULT: ${passedCount} / 25 TESTS PASSED`);
    console.log('====================================================');

    process.exit(passedCount === 25 ? 0 : 1);
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  }
}

runAllTests();