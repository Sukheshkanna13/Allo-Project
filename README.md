# 🚀 Allo Health — High-Concurrency Inventory Reservation System

A production-grade, transaction-safe **Inventory Reservation & Checkout System** built for multi-warehouse retail and D2C brands. This project solves the critical checkout race condition where multiple concurrent shoppers attempt to book the last physical unit of a SKU.

---

## 📸 Core Architecture & Features

- **📦 Multi-Warehouse Stock Allocation**: Tracks physical inventory counts (`total_qty`) and active temporary holds (`reserved_qty`) across three regional hubs (Mumbai, Delhi, Bangalore).
- **🔒 Transactional Concurrency Protection**: Utilizing database-level serialized row locking (`SELECT ... FOR UPDATE`), ensuring exactly one concurrent checkout request succeeds during peak traffic, while others receive a clean `409 Conflict`.
- **🚫 Single Active Reservation Constraint**: To prevent cart complexity, stock hoarding, and orphaned locks, shopper sessions are limited to exactly **one** active reservation hold at a time. The system restores and persists active banners across browser refreshes.
- **💾 Database-Backed Idempotency (Bonus)**: Implements robust idempotency keys for both reservation placement and order confirmations, shielding the platform from network retries, double clicks, and duplicate payment side effects.
- **✉️ Asynchronous SMTP Email Receipts**: Dynamically transmits beautifully structured HTML transaction receipts upon order confirmation via Nodemailer SMTP.
- **⏲️ Real-Time Countdown Banners & Visual Transitions**: Features a 10-minute hold progress bar, live countdown, and immediate state updates (success, expiration, early cancellation) without page refreshes.
- **❌ Early Release**: Allows shoppers to release holds early via a "Cancel Reservation" button, immediately returning reserved stock to the warehouse pool.

---

## 🛠️ Technical Stack & Architectural Decisions

| Technology | Implementation Scope |
| :--- | :--- |
| **Next.js 14 (App Router)** | Framework for Serverless APIs, Edge routing, and visual layouts. |
| **TypeScript** | Structured types (`ReservationDetail`, `PageState`) enforced end-to-end. |
| **Supabase (PostgreSQL)** | Relational database, indexing, and transactional boundaries. |
| **Tailwind CSS** | Premium custom UI (glassmorphism cards, skeleton animations, apple-style shadows). |
| **Nodemailer** | SMTP transporter for transaction email dispatches. |

### 💡 Key Design & Engineering Trade-Offs

During design planning, several structural choices were made to optimize performance under high-concurrency, serverless edge environments:

#### 1. Why Hosted Supabase Client is Preferred Over Prisma
- **No Cold Start Latency**: Next.js Serverless Edge functions suffer heavy startup latency (cold starts) when loading Prisma's heavy Rust-compiled engine binaries. Supabase connects via direct HTTPS API queries, ensuring sub-second response times.
- **Connection Pool Protection**: Traditional ORMs like Prisma open direct TCP connections, which quickly exhaust database connection limits under high serverless scaling. Supabase routes requests through an optimized connection pooler automatically.

#### 2. Why PostgreSQL Row-Level Locks are Used Over Redis (Distributed Locks)
- **Preventing Dual-Write Out-of-Sync Bugs**: Implementing locks in Redis (like Upstash) paired with database writes in PostgreSQL creates a "dual-write" problem. If the server crashes or loses network connectivity *between* updating Redis and committing to PostgreSQL, the cache and database drift completely out of sync, leading to orphaned inventory locks.
- **Single ACID Transaction Boundary**: By keeping the `FOR UPDATE` locks and `idempotency_keys` inside PostgreSQL, the entire reservation workflow runs within a **single ACID transaction**. If the write fails, the lock releases, and the transaction rolls back atomically.

---

## 🔒 Concurrency & Transaction Safety Design

If two customers click "Reserve" simultaneously on the last available diagnostic kit, they trigger a concurrent race condition. We resolve this directly inside the database transaction:

```sql
CREATE OR REPLACE FUNCTION place_reservation(
  p_session_id   text,
  p_product_id   uuid,
  p_warehouse_id uuid,
  p_quantity     int
) RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
DECLARE
  v_inv            inventory%ROWTYPE;
  v_reservation_id uuid;
BEGIN
  -- 1. Serialized Row Lock: Lock the inventory SKU for this specific warehouse exclusively
  SELECT * INTO v_inv
  FROM inventory
  WHERE product_id = p_product_id
    AND warehouse_id = p_warehouse_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_not_found';
  END IF;

  -- 2. Concurrency Safety Check
  IF (v_inv.total_qty - v_inv.reserved_qty) < p_quantity THEN
    RAISE EXCEPTION 'insufficient_stock';
  END IF;

  -- 3. Atomic Updates
  UPDATE inventory
  SET reserved_qty = reserved_qty + p_quantity,
      updated_at   = now()
  WHERE id = v_inv.id;

  INSERT INTO reservations (session_id, product_id, warehouse_id, quantity, status, expires_at)
  VALUES (p_session_id, p_product_id, p_warehouse_id, p_quantity, 'active', now() + interval '10 minutes')
  RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;
END;
$$;
```

### Why this is bulletproof:
1. `FOR UPDATE` blocks Transaction #2 until Transaction #1 commits or rolls back.
2. When Transaction #2 resumes, it reads the newly updated `reserved_qty`, failing the stock check, and cleanly returning an `insufficient_stock` error (`409 Conflict`), making double-bookings impossible.
3. Decared as `SECURITY DEFINER` so Serverless Anon client routes can securely trigger transaction overrides bypassing standard direct Row-Level Security (RLS) tables policies.

---

## ⚡ Idempotency Implementation (Bonus)

To prevent duplicate charges or double holds under unstable network conditions, the Reserve and Confirm POST endpoints enforce standard `Idempotency-Key` tracking:

1. **The Flow**:
   - The React client generates a unique UUID (`crypto.randomUUID()`) and forwards it as the `Idempotency-Key` header with each POST query.
   - On the server, we inspect this header and check our `idempotency_keys` table.
   - If a record exists, the server immediately returns the cached JSON payload and HTTP response code without executing any database modifications or sending duplicate emails.
   - If no record exists, the server executes the transaction, stores the exact API response in the table, and returns the response.

---

## ⏱️ Production Expiration & Cleanup Mechanism

Active reservations are held for exactly 10 minutes. If the shopper fails to check out, holds are safely swept and inventory is restored through a multi-layered strategy:

1. **Self-Healing Lazy Cleanup (Default)**:
   Every time any customer attempts to make a new reservation (`POST /api/reservations`), the server automatically runs `expire_reservations()`. This runs a non-blocking `FOR UPDATE SKIP LOCKED` query to sweep and unlock expired records in the database, ensuring active traffic triggers immediate inventory recovery.
2. **Hobby-Tier Complying Production Cron**:
   We exposed a dedicated endpoint: `GET /api/cleanup`. 
   To comply with **Vercel's free Hobby Tier limit** (which caps Cron Jobs at a maximum of **once per day**), we configured `vercel.json` to execute a safety sweep daily at midnight:
   ```json
   {
     "crons": [
       {
         "path": "/api/cleanup",
         "schedule": "0 0 * * *"
       }
     ]
   }
   ```
   *Note: In a premium Vercel Pro environment, this schedule can simply be set to run every minute (`* * * * *`) or 5 minutes (`*/5 * * * *`).*

---

## ⚙️ Local Setup Guide

### 1. Configure Local Variables
Create a `.env.local` file in the root directory:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_hosted_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EMAIL_HOST_USER=your_gmail_sender@gmail.com
EMAIL_HOST_PASSWORD=your_app_specific_gmail_password
```

### 2. Populate DB Migrations & Seeds
Execute the SQL scripts found in `supabase/migrations/` sequentially in your Supabase SQL Editor:
1. `20260524040407_create_inventory_reservation_system.sql` *(Schema, indices, seed data)*.
2. `20260524050500_strict_confirm_and_idempotency.sql` *(Strict expiration check & idempotency table)*.
3. `20260524052800_fix_rpc_security.sql` *(Security Definer rules bypass)*.

### 3. Run the Clean Server
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the storefront!
