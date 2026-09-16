# GigSevak — Unified Cooperative Gig Platform

GigSevak is a cooperative gig platform integrating three distinct client applications with a single shared Node.js/Express backend and a single canonical MongoDB database.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       GigSevak Platform                     │
└──────────────────────────────┬──────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               │    gigsevak-backend (Port 5000)│
               │    Node.js + Express + MongoDB │
               └───────────────▲───────────────┘
                               │
       ┌───────────────────────┼───────────────────────┐
       │                       │                       │
┌──────┴─────────┐     ┌───────┴────────┐     ┌────────┴────────┐
│  user-frontend │     │ worker-frontend│     │  admin-frontend │
│  Customer Web  │     │ Cooperative    │     │ Apex & Society  │
│  (Port 5173)   │     │ Worker Portal  │     │ Admin Portal    │
│                │     │ (Port 5174)    │     │ (Port 5175)     │
└────────────────┘     └────────────────┘     └─────────────────┘
```

---

## Prerequisites
- **Node.js:** v18+ (Tested on v24.15.0)
- **npm:** v9+
- **MongoDB:** Optional (External MongoDB connection string via `MONGODB_URI` or automatic embedded in-memory MongoDB fallback in dev mode)

---

## Platform Repositories & Ports

| Application | Directory | Tech Stack | Default Port | Description |
|---|---|---|---|---|
| **Shared Backend** | `gigsevak-backend` | Node.js + Express + Mongoose | `5000` | Central REST API, RBAC, state machine, and pricing engine |
| **Customer Web** | `user-frontend/user-frontend` | React 18 + Vite | `5173` | Customer booking, tracking, and review portal |
| **Worker Portal** | `worker-frontend/frontend` | React 19 + Vite + TypeScript | `5174` | Cooperative artisan job dispatch, transit, and completion |
| **Admin Portal** | `admin-frontend/admin` | React 19 + Vite + TypeScript | `5175` | Federation & Society administrative oversight |

---

## Environment Variables

### Backend (`gigsevak-backend/.env`):
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/gigsevak
JWT_SECRET=gigsevak_jwt_secret_dev_key_2026_super_safe
JWT_REFRESH_SECRET=gigsevak_jwt_refresh_dev_key_2026_super_safe
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
NODE_ENV=development
```

### Frontends (`.env` in each frontend directory):
```env
VITE_API_BASE_URL=http://localhost:5000/api
```

---

## Getting Started & Commands

### 1. Shared Backend Setup & Startup
```bash
cd gigsevak-backend
npm install
npm run seed     # Seeds canonical services, societies, and accounts
npm start        # Launches API on port 5000
```

### 2. Customer Frontend Setup & Startup
```bash
cd user-frontend/user-frontend
npm install
npm run dev      # Launches on http://localhost:5173
```

### 3. Worker Frontend Setup & Startup
```bash
cd worker-frontend/frontend
npm install
npm run dev      # Launches on http://localhost:5174
```

### 4. Admin Frontend Setup & Startup
```bash
cd admin-frontend/admin
npm install
npm run dev      # Launches on http://localhost:5175
```

---

## Running Verification Tests & Builds

### Run 25-Test E2E Automated Suite:
```bash
cd gigsevak-backend
node tests/run-all-25-tests.js
```

### Production Build Commands:
```bash
# Build Customer Frontend
cd user-frontend/user-frontend && npm run build

# Build Worker Frontend
cd worker-frontend/frontend && npm run build

# Build Admin Frontend
cd admin-frontend/admin && npm run build
```

---

## Test Accounts & Credentials

| Role | Identifier / Email | Password / OTP | Access Scope |
|---|---|---|---|
| **Platform Super Admin** | `admin@gigsevak.coop` | `admin123` | Global Platform |
| **Society Admin** | `vikram@gigsevak.coop` | `admin123` | South Delhi Cooperative (`SOC-SD-001`) |
| **Worker (Electrician)** | `+919811100001` | OTP `123456` | Master Tier, `WK-DEL-001` |
| **Worker (Cleaner)** | `+919811100002` | OTP `123456` | Senior Tier, `WK-DEL-002` |
| **Customer** | `+919876543210` | OTP `123456` | Verified Customer (`Priya Narang`) |

---

## Canonical Documentation
Comprehensive architecture documentation is maintained in the `docs/` directory:
- `docs/final-integration-audit.md` — Initial audit, inconsistencies found, and production mitigations.
- `docs/api-integration-matrix.md` — Frontend-to-database API traceability matrix.
- `docs/database-schema.md` — 15 canonical Mongoose models, schemas, and indexes.
- `docs/rbac-matrix.md` — Multi-tenant role permissions and server-side scoping rules.
- `docs/booking-state-machine.md` — Complete lifecycle state transitions and security guards.
- `docs/security-audit.md` — Security controls, HMAC OTP verification, and IDOR protection.
- `docs/e2e-test-report.md` — Full execution report of the 25 automated E2E tests.