-- Fix: Make RPC functions SECURITY DEFINER so they can update the inventory table 
-- (which is protected by RLS and has no UPDATE policy for anon users).

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

CREATE OR REPLACE FUNCTION release_reservation(
  p_reservation_id uuid,
  p_new_status     text
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION expire_reservations() RETURNS int
  LANGUAGE plpgsql
  SECURITY DEFINER
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
