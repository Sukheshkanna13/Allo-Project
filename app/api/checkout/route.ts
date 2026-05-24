import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

interface ReservationWithProduct {
  id: string;
  session_id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  status: string;
  expires_at: string;
  product: {
    id: string;
    name: string;
    price: number | string;
  } | null;
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const body = await req.json();
  const { reservation_id, session_id, customer_email } = body;

  if (!reservation_id || !session_id || !customer_email) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  // Fetch reservation with product
  const { data: reservation, error: fetchError } = await supabase
    .from('reservations')
    .select('*, product:products(*)')
    .eq('id', reservation_id)
    .eq('session_id', session_id)
    .eq('status', 'active')
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!reservation) {
    return NextResponse.json(
      { error: 'reservation_not_found_or_expired' },
      { status: 404 }
    );
  }

  const typedReservation = reservation as ReservationWithProduct;

  // Check expiration
  if (new Date(typedReservation.expires_at) < new Date()) {
    await supabase.rpc('release_reservation', {
      p_reservation_id: reservation_id,
      p_new_status: 'expired',
    });
    return NextResponse.json({ error: 'reservation_expired' }, { status: 410 });
  }

  // Parse price (may be string from numeric column)
  const priceNum = typeof typedReservation.product?.price === 'string'
    ? parseFloat(typedReservation.product.price)
    : (typedReservation.product?.price ?? 0);

  const total_price = priceNum * typedReservation.quantity;

  // Confirm reservation (atomically reduces total_qty)
  const { error: releaseError } = await supabase.rpc('release_reservation', {
    p_reservation_id: reservation_id,
    p_new_status: 'confirmed',
  });

  if (releaseError) {
    return NextResponse.json({ error: releaseError.message }, { status: 500 });
  }

  // Create order record
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      reservation_id,
      session_id,
      product_id: typedReservation.product_id,
      warehouse_id: typedReservation.warehouse_id,
      quantity: typedReservation.quantity,
      total_price,
      customer_email,
      status: 'paid',
    })
    .select()
    .maybeSingle();

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  return NextResponse.json({ order }, { status: 201 });
}
