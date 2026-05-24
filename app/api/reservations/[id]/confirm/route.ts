import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendOrderConfirmationEmail } from '@/lib/email';
import { ConfirmReservationSchema } from '@/lib/schemas';
import { getCachedResponse, setCachedResponse } from '@/lib/redis';

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
  
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  // 1. Zod validation for confirmation payload
  const validation = ConfirmReservationSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({
      error: 'validation_error',
      details: validation.error.format()
    }, { status: 400 });
  }

  const { session_id, customer_email } = validation.data;

  if (!reservation_id) {
    return NextResponse.json({ error: 'missing_reservation_id' }, { status: 400 });
  }

  // 2. Check Idempotency Key in Redis
  if (idempotencyKey) {
    const cached = await getCachedResponse(idempotencyKey);
    if (cached) {
      return NextResponse.json(cached.body, { status: cached.status });
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
      const responseBody = { error: 'reservation_expired' };
      const status = 410;
      if (idempotencyKey) {
        await setCachedResponse(idempotencyKey, { body: responseBody, status }, 86400);
      }
      return NextResponse.json(responseBody, { status });
    }
    const responseBody = { error: releaseError.message };
    const status = 500;
    if (idempotencyKey) {
      await setCachedResponse(idempotencyKey, { body: responseBody, status }, 86400);
    }
    return NextResponse.json(responseBody, { status });
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
    const responseBody = { error: orderError.message };
    const status = 500;
    if (idempotencyKey) {
      await setCachedResponse(idempotencyKey, { body: responseBody, status }, 86400);
    }
    return NextResponse.json(responseBody, { status });
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
    await setCachedResponse(idempotencyKey, { body: responseBody, status: responseStatus }, 86400);
  }

  return NextResponse.json(responseBody, { status: responseStatus });
}
