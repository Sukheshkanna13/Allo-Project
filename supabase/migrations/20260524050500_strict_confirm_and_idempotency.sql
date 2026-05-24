-- 1. Idempotency Table
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key         text PRIMARY KEY,
  response    jsonb NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- Index to clean up old keys (e.g. older than 24h) if needed
CREATE INDEX IF NOT EXISTS idx_idempotency_created_at ON idempotency_keys(created_at);

-- 2. Strict Release/Confirm Reservation Function
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

  -- Ensure we cannot confirm an expired reservation
  IF p_new_status = 'confirmed' AND v_res.expires_at < now() THEN
    RAISE EXCEPTION 'reservation_expired';
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
