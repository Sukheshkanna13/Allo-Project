# 🚀 Allo Health — Inventory & Reservation Platform

A premium, high-concurrency **Inventory Reservation & Checkout System** built for multi-warehouse retail and D2C brands, satisfying all constraints of the Allo Health Take-Home Engineering Exercise.

---

## 📸 Key Features & Architecture
- **📦 Multi-Warehouse Stock Management**: Distinct tracking of physical inventory, total stock, and active reservations across multiple hubs (Mumbai, Delhi, Bangalore).
- **🔒 Race-Condition-Free Reservation System**: Strict database-level row locking (`FOR UPDATE`) guarantees that under high concurrent load (e.g., thousands of checkout requests for the last physical item), exactly **one** shopper secures the hold while others receive a clean `409 Conflict`.
- **✉️ Real-Time SMTP Email Receipts**: Gmail/SMTP-driven HTML email confirmations sent automatically upon order completion.
- **💾 Full Idempotency Support (Bonus)**: Both the reservation creation and order confirmation endpoints support `Idempotency-Key` headers, guarding against network retries and duplicate payments.
- **⏲️ Live Countdown Timer & State Transitions**: A highly responsive, visual, Apple-inspired UI that includes a 10-minute hold progress bar, live countdown, and immediate state sync without page refreshes.
- **❌ Early Release**: Active "Cancel Reservation" flow that lets shoppers release holds early to immediately free up stock for other buyers.
- **🚫 Single Active Reservation Constraint**: To prevent cart complexity and orphaned database locks, each user session is limited to exactly one active reservation. Attempting to reserve another SKU before checking out or cancelling the current hold triggers a descriptive error alert, and the active reservation details remain persistent across browser refreshes.

---

## 🛠️ Tech Stack & Services
1. **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS + Lucide Icons.
2. **Database**: Managed Supabase PostgreSQL Instance (handles relational structures and transaction safety).
3. **Emailing**: Nodemailer with SMTP transporter config.
4. **Concurrency Layer**: PL/pgSQL database stored procedures (`SECURITY DEFINER` and atomic `FOR UPDATE` transactions).

---

## ⚙️ How to Run the App Locally

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/Sukheshkanna13/Allo-Project.git
cd Allo-Project
npm install
```

### 2. Configure Environment Variables
Create a `.env.local` file in the root directory:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EMAIL_HOST_USER=your_gmail_address@gmail.com
EMAIL_HOST_PASSWORD=your_app_specific_gmail_password
```

### 3. Database Schema & Migration Setup
The project database is managed through three SQL migration files located in `supabase/migrations/`:
1. `20260524040407_create_inventory_reservation_system.sql`: Establishes the tables, relations, indexes, initial seed data (3 warehouses, 6 premium products, pre-allocated stock levels), and core PL/pgSQL procedures.
2. `20260524050500_strict_confirm_and_idempotency.sql`: Creates the `idempotency_keys` table and rewrites the reservation release function to prevent expired holds from ever being confirmed.
3. `20260524052800_fix_rpc_security.sql`: Declares procedures with `SECURITY DEFINER` privileges, bypassing direct table update restrictions under Row-Level Security (RLS) for anonymous clients.

**To deploy them**:
- Simply copy the scripts into your Supabase SQL editor and execute them sequentially (or run `supabase db push` if you have the Supabase CLI initialized).

### 4. Launch the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the storefront!

---

## 🔒 Concurrency Design & Race Condition Resolution

If two customers click "Reserve" simultaneously on the very last unit of a SKU, they trigger a concurrent race condition. We resolve this elegantly inside the database transaction:

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
  -- 1. Lock the inventory row strictly for update
  SELECT * INTO v_inv
  FROM inventory
  WHERE product_id = p_product_id
    AND warehouse_id = p_warehouse_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_not_found';
  END IF;

  -- 2. Concurrency check
  IF (v_inv.total_qty - v_inv.reserved_qty) < p_quantity THEN
    RAISE EXCEPTION 'insufficient_stock';
  END IF;

  -- 3. Atomically update inventory and log reservation
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
- `FOR UPDATE` serializes concurrent transactions requesting the same SKU at the same warehouse.
- Transaction #2 is held in queue until Transaction #1 commits. When Transaction #2 resumes, it reads the updated `reserved_qty`, failing the subtraction condition and cleanly raising an `'insufficient_stock'` exception (`409 Conflict`), ensuring zero double-bookings.

---

## ⚡ Idempotency Implementation (Bonus)

We implemented robust idempotency for both the **Reserve** and **Confirm** POST endpoints.

1. **How it works**:
   - The frontend generates a unique UUID (e.g. `crypto.randomUUID()`) and forwards it as the `Idempotency-Key` header with every checkout POST request.
   - On the server, we inspect this header and query our `idempotency_keys` table.
   - If a record is found, we instantly return the cached JSON body and HTTP response status code without executing any database modifications or sending duplicate emails.
   - If no record exists, the server executes the transaction, stores the exact API output in the `idempotency_keys` table, and returns the response.
2. **Safety**: This ensures network retries (e.g., when the customer's phone disconnects during a payment gateway redirect) never result in duplicate orders or double-deducted inventory.

---

## ⏱️ Expiry Mechanism & Production Cleanup

Expired holds are automatically returned to available inventory through a robust multi-layered strategy:

1. **Lazy Cleanup on Request (Default)**:
   Whenever any customer requests a new reservation (`POST /api/reservations`), the server runs `expire_reservations()` first. It finds active reservations where `expires_at < now()`, locks them using `FOR UPDATE SKIP LOCKED` to avoid blocking concurrent checkout actions, and releases the inventory immediately.
2. **Active Production Cron**:
   We created a cron-ready route: `GET /api/cleanup`. 
   In production, you can trigger this endpoint on a recurring interval (e.g. every 1 minute) using a scheduler like:
   - **Vercel Cron Jobs** (`vercel.json` scheduler)
   - **Upstash QStash / Cron**
   - **GitHub Actions** workflows

---

## ⚖️ Trade-offs & Future Enhancements

With more time in a production environment, we would prioritize:
1. **Dedicated Cache for Idempotency**: Replace the postgres `idempotency_keys` table with an in-memory Redis cluster (e.g., Upstash) using an automatic Time-To-Live (TTL) of 24 hours to keep the main SQL storage slim.
2. **Distributed Locks (Redlock)**: Utilize Redis distributed locking for microsecond-sensitive concurrent queries instead of relying entirely on heavy relational DB row locks, minimizing DB load.
3. **Queue-driven Emailing**: Move email confirmations to a message queue (e.g., BullMQ or Amazon SQS) with automatic retry handling instead of running the nodemailer transporter asynchronously inside the HTTP handler.
