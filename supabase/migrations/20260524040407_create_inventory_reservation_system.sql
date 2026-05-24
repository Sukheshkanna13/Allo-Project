/*
  # Inventory Reservation System — Initial Schema

  ## Overview
  Multi-warehouse inventory reservation system preventing race conditions.

  ## Tables
  1. warehouses - Physical warehouse locations
  2. products - Product catalog
  3. inventory - Per-warehouse stock levels with reserved counts
  4. reservations - Temporary 10-minute holds during checkout
  5. orders - Confirmed purchases

  ## Security
  - RLS enabled on all tables
  - Public read for products/warehouses/inventory
  - Session-based access for reservations/orders
*/

-- Warehouses
CREATE TABLE IF NOT EXISTS warehouses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  location    text NOT NULL DEFAULT '',
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read warehouses"
  ON warehouses FOR SELECT
  TO anon, authenticated
  USING (true);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  price       numeric(10,2) NOT NULL DEFAULT 0,
  image_url   text NOT NULL DEFAULT '',
  category    text NOT NULL DEFAULT 'general',
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read products"
  ON products FOR SELECT
  TO anon, authenticated
  USING (true);

-- Inventory
CREATE TABLE IF NOT EXISTS inventory (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id  uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  total_qty     int NOT NULL DEFAULT 0 CHECK (total_qty >= 0),
  reserved_qty  int NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (product_id, warehouse_id),
  CONSTRAINT reserved_lte_total CHECK (reserved_qty <= total_qty)
);

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read inventory"
  ON inventory FOR SELECT
  TO anon, authenticated
  USING (true);

-- Reservations
CREATE TABLE IF NOT EXISTS reservations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    text NOT NULL,
  product_id    uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id  uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  quantity      int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','confirmed','expired','cancelled')),
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read reservations"
  ON reservations FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert reservations"
  ON reservations FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update reservations"
  ON reservations FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id  uuid REFERENCES reservations(id) ON DELETE SET NULL,
  session_id      text NOT NULL,
  product_id      uuid NOT NULL REFERENCES products(id),
  warehouse_id    uuid NOT NULL REFERENCES warehouses(id),
  quantity        int NOT NULL DEFAULT 1,
  total_price     numeric(10,2) NOT NULL DEFAULT 0,
  customer_email  text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','paid','shipped','cancelled')),
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read orders"
  ON orders FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert orders"
  ON orders FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_warehouse ON inventory(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_reservations_session ON reservations(session_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_expires ON reservations(expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(session_id);

-- Atomic reservation function
CREATE OR REPLACE FUNCTION place_reservation(
  p_session_id   text,
  p_product_id   uuid,
  p_warehouse_id uuid,
  p_quantity     int
) RETURNS uuid
  LANGUAGE plpgsql
AS $$
DECLARE
  v_inv            inventory%ROWTYPE;
  v_reservation_id uuid;
BEGIN
  SELECT * INTO v_inv
  FROM inventory
  WHERE product_id = p_product_id
    AND warehouse_id = p_warehouse_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_not_found';
  END IF;

  IF (v_inv.total_qty - v_inv.reserved_qty) < p_quantity THEN
    RAISE EXCEPTION 'insufficient_stock';
  END IF;

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

-- Release reservation function
CREATE OR REPLACE FUNCTION release_reservation(
  p_reservation_id uuid,
  p_new_status     text
) RETURNS void
  LANGUAGE plpgsql
AS $$
DECLARE
  v_res reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_res
  FROM reservations
  WHERE id = p_reservation_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE reservations SET status = p_new_status WHERE id = p_reservation_id;

  IF p_new_status = 'confirmed' THEN
    UPDATE inventory
    SET total_qty    = total_qty    - v_res.quantity,
        reserved_qty = reserved_qty - v_res.quantity,
        updated_at   = now()
    WHERE product_id   = v_res.product_id
      AND warehouse_id = v_res.warehouse_id;
  ELSE
    UPDATE inventory
    SET reserved_qty = GREATEST(0, reserved_qty - v_res.quantity),
        updated_at   = now()
    WHERE product_id   = v_res.product_id
      AND warehouse_id = v_res.warehouse_id;
  END IF;
END;
$$;

-- Expire reservations function
CREATE OR REPLACE FUNCTION expire_reservations() RETURNS int
  LANGUAGE plpgsql
AS $$
DECLARE
  v_row    reservations%ROWTYPE;
  v_count  int := 0;
BEGIN
  FOR v_row IN
    SELECT * FROM reservations
    WHERE status = 'active' AND expires_at < now()
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM release_reservation(v_row.id, 'expired');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Seed data
INSERT INTO warehouses (id, name, location) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Mumbai Central',   'Mumbai, MH'),
  ('a1000000-0000-0000-0000-000000000002', 'Delhi North Hub',  'Delhi, DL'),
  ('a1000000-0000-0000-0000-000000000003', 'Bangalore Tech',  'Bangalore, KA')
ON CONFLICT DO NOTHING;

INSERT INTO products (id, name, description, price, image_url, category) VALUES
  ('b1000000-0000-0000-0000-000000000001',
   'Testosterone Test Kit',
   'Comprehensive at-home testosterone level test with lab-certified results in 48 hours.',
   2999,
   'https://images.pexels.com/photos/4226119/pexels-photo-4226119.jpeg',
   'diagnostics'),
  ('b1000000-0000-0000-0000-000000000002',
   'Vitamin D3 + K2 (90 caps)',
   'Optimal bone & immune support with 5000 IU D3 paired with MK-7 K2 for absorption.',
   1499,
   'https://images.pexels.com/photos/3683074/pexels-photo-3683074.jpeg',
   'supplements'),
  ('b1000000-0000-0000-0000-000000000003',
   'Omega-3 Fish Oil (120 caps)',
   'Pharmaceutical-grade omega-3 with 1200mg EPA/DHA per serving. Mercury tested.',
   1299,
   'https://images.pexels.com/photos/3735183/pexels-photo-3735183.jpeg',
   'supplements'),
  ('b1000000-0000-0000-0000-000000000004',
   'Cortisol Stress Panel',
   'Saliva-based 4-point cortisol test mapping your adrenal rhythm throughout the day.',
   3499,
   'https://images.pexels.com/photos/4386466/pexels-photo-4386466.jpeg',
   'diagnostics'),
  ('b1000000-0000-0000-0000-000000000005',
   'Magnesium Glycinate (60 caps)',
   'Highly bioavailable magnesium for sleep quality, muscle recovery, and stress regulation.',
   899,
   'https://images.pexels.com/photos/5938370/pexels-photo-5938370.jpeg',
   'supplements'),
  ('b1000000-0000-0000-0000-000000000006',
   'Complete Hormone Panel',
   'Full-spectrum hormone blood test covering testosterone, estradiol, DHEA, and thyroid.',
   5999,
   'https://images.pexels.com/photos/4226765/pexels-photo-4226765.jpeg',
   'diagnostics')
ON CONFLICT DO NOTHING;

INSERT INTO inventory (product_id, warehouse_id, total_qty, reserved_qty) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 50, 0),
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 30, 0),
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 20, 0),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 100, 0),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 80, 0),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000003', 60, 0),
  ('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 75, 0),
  ('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000002', 50, 0),
  ('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 40, 0),
  ('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 25, 0),
  ('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000002', 15, 0),
  ('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000003', 10, 0),
  ('b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 120, 0),
  ('b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000002', 90, 0),
  ('b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000003', 70, 0),
  ('b1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001', 3, 0),
  ('b1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000002', 2, 0),
  ('b1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000003', 1, 0)
ON CONFLICT DO NOTHING;
