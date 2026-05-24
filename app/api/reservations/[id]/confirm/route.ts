import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendOrderConfirmationEmail } from '@/lib/email';

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

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient();
  const idempotencyKey = req.headers.get('Idempotency-Key');
  const reservation_id = params.id;
  
  const body = await req.json();
  const { session_id, customer_email } = body;

  if (!reservation_id || !session_id || !customer_email) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  // Idempotency check
  if (idempotencyKey) {
    const { data: cached } = await supabase
      .from('idempotency_keys')
      .select('response')
      .eq('key', idempotencyKey)
      .maybeSingle();

    if (cached) {
      return NextResponse.json(cached.response.body, { status: cached.response.status });
    }
  }

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

  const priceNum = typeof typedReservation.product?.price === 'string'
    ? parseFloat(typedReservation.product.price)
    : (typedReservation.product?.price ?? 0);

  const total_price = priceNum * typedReservation.quantity;

  const { error: releaseError } = await supabase.rpc('release_reservation', {
    p_reservation_id: reservation_id,
    p_new_status: 'confirmed',
  });

  if (releaseError) {
    if (releaseError.message.includes('reservation_expired')) {
      return NextResponse.json({ error: 'reservation_expired' }, { status: 410 });
    }
    return NextResponse.json({ error: releaseError.message }, { status: 500 });
  }

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

  // Fire email asynchronously
  void sendOrderConfirmationEmail({
    orderId: order.id,
    customerEmail: customer_email,
    productName: typedReservation.product?.name ?? 'Unknown Product',
    quantity: typedReservation.quantity,
    totalPrice: total_price,
  });

  const responseBody = { order };
  const responseStatus = 201;

  if (idempotencyKey) {
    await supabase.from('idempotency_keys').insert({
      key: idempotencyKey,
      response: { body: responseBody, status: responseStatus }
    });
  }

  return NextResponse.json(responseBody, { status: responseStatus });
}
