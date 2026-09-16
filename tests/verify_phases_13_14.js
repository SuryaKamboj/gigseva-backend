const http = require('http');

const API_BASE = 'http://localhost:5000/api';

async function request(path, options = {}) {
  const fullUrl = `${API_BASE}${path.startsWith('/') ? path : '/' + path}`;
  const url = new URL(fullUrl);
  return new Promise((resolve, reject) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    const req = http.request(url, {
      method: options.method || 'GET',
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function login(mobileNumber, role = 'WORKER') {
  if (role === 'CUSTOMER' || role === 'WORKER') {
    const loginRes = await request('/auth/login', {
      method: 'POST',
      body: { mobileNumber, role }
    });
    if (loginRes.status >= 400) {
      throw new Error(`login request failed for ${mobileNumber}: ${JSON.stringify(loginRes.body)}`);
    }
  }

  const verifyRes = await request('/auth/verify-otp', {
    method: 'POST',
    body: { mobileNumber, otp: '123456', role }
  });
  const token = verifyRes.body.data?.accessToken || verifyRes.body.token || verifyRes.body.accessToken;
  if (verifyRes.status >= 400 || !token) {
    throw new Error(`verify-otp failed for ${mobileNumber}: ${JSON.stringify(verifyRes.body)}`);
  }
  return { ...verifyRes.body, token };
}

async function getWorkerProfile(token) {
  const res = await request('/workers/me', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.status >= 400) {
    throw new Error(`getProfile failed: ${JSON.stringify(res.body)}`);
  }
  return res.body.data || res.body;
}

async function submitOnboarding(token, { aadhaar, skills, locationName }) {
  const res = await request('/workers/me/onboarding', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: {
      aadhaarNumber: aadhaar,
      aadhaarVerified: true,
      selfieUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
      skills: skills || ['ELECTRICAL', 'PLUMBING'],
      primaryServiceCategory: skills ? skills[0] : 'ELECTRICAL',
      location: {
        latitude: 28.5244,
        longitude: 77.2060,
        name: locationName || 'Delhi NCR'
      },
      serviceArea: locationName || 'Delhi NCR',
      addressLine: 'Block C, Sector 12'
    }
  });
  return res.body;
}

async function adminUpdateKyc(adminToken, workerId, { status, notes, rejectionReason }) {
  const res = await request(`/admin/workers/${workerId}/kyc`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { status, notes, rejectionReason }
  });
  if (res.status >= 400) {
    throw new Error(`admin kyc update failed: ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

async function adminLogin() {
  const res = await request('/auth/admin/login', {
    method: 'POST',
    body: { userId: 'admin@gigsevak.coop', password: 'admin123' }
  });
  const token = res.body.data?.accessToken || res.body.accessToken;
  if (res.status >= 400 || !token) {
    throw new Error(`admin login failed: ${JSON.stringify(res.body)}`);
  }
  return token;
}

async function run() {
  console.log('====================================================');
  console.log('STARTING E2E VERIFICATION: PHASES 13 & 14');
  console.log('====================================================\n');

  // --- 1. Login Worker A ---
  console.log('--> Step 1: Authenticating Worker A (+919876543210)...');
  const authA = await login('+919876543210');
  await submitOnboarding(authA.token, { aadhaar: '548291038491', locationName: 'Lajpat Nagar' });
  const profileA = await getWorkerProfile(authA.token);
  console.log(`Worker A registered: ID=${profileA._id}, Name="${profileA.fullName}", Status="${profileA.kycVerificationStatus}"`);

  // --- 2. Login Worker B ---
  console.log('\n--> Step 2: Authenticating Worker B (+919876543211)...');
  const authB = await login('+919876543211');
  await submitOnboarding(authB.token, { aadhaar: '548291038492', locationName: 'Saket' });
  const profileB = await getWorkerProfile(authB.token);
  console.log(`Worker B registered: ID=${profileB._id}, Name="${profileB.fullName}", Status="${profileB.kycVerificationStatus}"`);

  // --- 3. Login Worker C ---
  console.log('\n--> Step 3: Authenticating Worker C (+919876543212)...');
  const authC = await login('+919876543212');
  await submitOnboarding(authC.token, { aadhaar: '548291038493', locationName: 'Kalkaji' });
  const profileC = await getWorkerProfile(authC.token);
  console.log(`Worker C registered: ID=${profileC._id}, Name="${profileC.fullName}", Status="${profileC.kycVerificationStatus}"`);

  // --- 4. Verify Identity Independence (A != B != C) ---
  console.log('\n--> Step 4: Verifying Identity Distinctness & Initial Status...');
  if (profileA._id === profileB._id || profileB._id === profileC._id || profileA._id === profileC._id) {
    throw new Error('FAIL: Worker IDs are not distinct!');
  }
  console.log('✓ PASS: All 3 worker IDs are distinct!');
  console.log(`✓ Status check: A=${profileA.kycVerificationStatus}, B=${profileB.kycVerificationStatus}, C=${profileC.kycVerificationStatus}`);

  // --- 5. Admin Login & Approval of Worker A ---
  console.log('\n--> Step 5: Admin Approving Worker A...');
  const adminToken = await adminLogin();
  await adminUpdateKyc(adminToken, profileA._id, {
    status: 'VERIFIED',
    notes: 'Aadhaar and credentials verified by admin'
  });
  console.log(`✓ Worker A (${profileA._id}) approved by Admin`);

  // --- 6. Verify Post-Approval Isolation ---
  console.log('\n--> Step 6: Verifying Worker Statuses after Worker A Approval...');
  const profileA_after = await getWorkerProfile(authA.token);
  const profileB_after = await getWorkerProfile(authB.token);
  const profileC_after = await getWorkerProfile(authC.token);

  console.log(`Worker A: ${profileA_after.kycVerificationStatus} (Expected: VERIFIED)`);
  console.log(`Worker B: ${profileB_after.kycVerificationStatus} (Expected: PENDING)`);
  console.log(`Worker C: ${profileC_after.kycVerificationStatus} (Expected: PENDING)`);

  if (profileA_after.kycVerificationStatus !== 'VERIFIED') throw new Error('Worker A should be VERIFIED');
  if (profileB_after.kycVerificationStatus !== 'PENDING') throw new Error('Worker B should remain PENDING');
  if (profileC_after.kycVerificationStatus !== 'PENDING') throw new Error('Worker C should remain PENDING');
  console.log('✓ PASS: Isolation verified: Only Worker A was approved!');

  // --- 7. Admin Rejection of Worker C with Reason ---
  console.log('\n--> Step 7: Admin Rejecting Worker C with explicit reason...');
  const rejectionReason = 'Aadhaar photo does not match live selfie capture. Please re-upload.';
  await adminUpdateKyc(adminToken, profileC._id, {
    status: 'REJECTED',
    rejectionReason
  });
  console.log(`✓ Worker C (${profileC._id}) rejected by Admin`);

  // --- 8. Verify Statuses after Worker C Rejection ---
  console.log('\n--> Step 8: Verifying Worker Statuses after Worker C Rejection...');
  const profileA_postRejection = await getWorkerProfile(authA.token);
  const profileB_postRejection = await getWorkerProfile(authB.token);
  const profileC_postRejection = await getWorkerProfile(authC.token);

  console.log(`Worker A: ${profileA_postRejection.kycVerificationStatus} (Expected: VERIFIED)`);
  console.log(`Worker B: ${profileB_postRejection.kycVerificationStatus} (Expected: PENDING)`);
  console.log(`Worker C: ${profileC_postRejection.kycVerificationStatus} (Expected: REJECTED)`);
  console.log(`Worker C Rejection Reason: "${profileC_postRejection.rejectionReason}"`);

  if (profileA_postRejection.kycVerificationStatus !== 'VERIFIED') throw new Error('Worker A should remain VERIFIED');
  if (profileB_postRejection.kycVerificationStatus !== 'PENDING') throw new Error('Worker B should remain PENDING');
  if (profileC_postRejection.kycVerificationStatus !== 'REJECTED') throw new Error('Worker C should be REJECTED');
  if (!profileC_postRejection.rejectionReason?.includes('Aadhaar photo')) throw new Error('Worker C rejection reason missing');
  console.log('✓ PASS: Isolation verified: Only Worker C was rejected with reason preserved!');

  // --- 9. Phase 14: Relogin Persistence Test ---
  console.log('\n--> Step 9: Testing Relogin Persistence (Phase 14)...');
  
  // Relogin Worker A
  const reloginA = await login('+919876543210');
  const profileA_relogin = await getWorkerProfile(reloginA.token);
  console.log(`Worker A relogin: ID=${profileA_relogin._id}, Name="${profileA_relogin.fullName}", Status="${profileA_relogin.kycVerificationStatus}"`);
  if (profileA_relogin._id.toString() !== profileA._id.toString()) throw new Error('Worker A ID changed after relogin!');
  if (profileA_relogin.fullName !== profileA.fullName) throw new Error('Worker A Name changed after relogin!');
  if (profileA_relogin.kycVerificationStatus !== 'VERIFIED') throw new Error('Worker A lost VERIFIED status after relogin!');
  console.log('✓ Worker A identity, persistent mock Aadhaar name, and status perfectly preserved!');

  // Relogin Worker B
  const reloginB = await login('+919876543211');
  const profileB_relogin = await getWorkerProfile(reloginB.token);
  console.log(`Worker B relogin: ID=${profileB_relogin._id}, Name="${profileB_relogin.fullName}", Status="${profileB_relogin.kycVerificationStatus}"`);
  if (profileB_relogin._id.toString() !== profileB._id.toString()) throw new Error('Worker B ID changed after relogin!');
  if (profileB_relogin.fullName !== profileB.fullName) throw new Error('Worker B Name changed after relogin!');
  if (profileB_relogin.kycVerificationStatus !== 'PENDING') throw new Error('Worker B lost PENDING status after relogin!');
  console.log('✓ Worker B identity, persistent mock Aadhaar name, and status perfectly preserved!');

  // Relogin Worker C
  const reloginC = await login('+919876543212');
  const profileC_relogin = await getWorkerProfile(reloginC.token);
  console.log(`Worker C relogin: ID=${profileC_relogin._id}, Name="${profileC_relogin.fullName}", Status="${profileC_relogin.kycVerificationStatus}"`);
  if (profileC_relogin._id.toString() !== profileC._id.toString()) throw new Error('Worker C ID changed after relogin!');
  if (profileC_relogin.fullName !== profileC.fullName) throw new Error('Worker C Name changed after relogin!');
  if (profileC_relogin.kycVerificationStatus !== 'REJECTED') throw new Error('Worker C lost REJECTED status after relogin!');
  console.log('✓ Worker C identity, persistent mock Aadhaar name, and rejection status perfectly preserved!');

  console.log('\n====================================================');
  console.log('ALL PHASES 13 & 14 TESTS PASSED COMPLETELY!');
  console.log('====================================================');
}

run().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
