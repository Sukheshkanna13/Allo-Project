import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { CreateReservationSchema } from '@/lib/schemas';
import { acquireLock, releaseLock, getCachedResponse, setCachedResponse } from '@/lib/redis';

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const idempotencyKey = req.headers.get('Idempotency-Key');
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  // 1. Validate request payload with Zod
  const validation = CreateReservationSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({
      error: 'validation_error',
      details: validation.error.format()
    }, { status: 400 });
  }

  const { session_id, product_id, warehouse_id, quantity } = validation.data;

  // 2. Check Idempotency Key in Redis
  if (idempotencyKey) {
    const cached = await getCachedResponse(idempotencyKey);
    if (cached) {
      return NextResponse.json(cached.body, { status: cached.status });
    }
  }

  // 3. Acquire Distributed Lock at Product/Warehouse SKU level in Redis
  const lockKey = `${product_id}:${warehouse_id}`;
  const acquired = await acquireLock(lockKey, 5000);
  if (!acquired) {
    return NextResponse.json({
      error: 'concurrent_request_retry',
      message: 'System is busy processing holds for this product. Please retry in a moment.'
    }, { status: 429 });
  }

  try {
    await supabase.rpc('expire_reservations');

    // Enforce single active reservation per session
    const { data: existingActive, error: activeCheckError } = await supabase
      .from('reservations')
      .select('id')
      .eq('session_id', session_id)
      .eq('status', 'active')
      .maybeSingle();

    if (activeCheckError) {
      const responseBody = { error: activeCheckError.message };
      const status = 500;
      if (idempotencyKey) {
        await setCachedResponse(idempotencyKey, { body: responseBody, status }, 86400);
      }
      return NextResponse.json(responseBody, { status });
    }

    if (existingActive) {
      const errCode = 'active_reservation_exists';
      const status = 400;
      const responseBody = { error: errCode };
      if (idempotencyKey) {
        await setCachedResponse(idempotencyKey, { body: responseBody, status }, 86400);
      }
      return NextResponse.json(responseBody, { status });
    }

    const { data, error } = await supabase.rpc('place_reservation', {
      p_session_id: session_id,
      p_product_id: product_id,
      p_warehouse_id: warehouse_id,
      p_quantity: quantity,
    });

    if (error) {
      const msg = error.message ?? '';
      let status = 500;
      let errCode = msg;
      if (msg.includes('insufficient_stock')) {
        errCode = 'insufficient_stock';
        status = 409;
      } else if (msg.includes('inventory_not_found')) {
        errCode = 'inventory_not_found';
        status = 404;
      }
      
      const responseBody = { error: errCode };
      if (idempotencyKey) {
        await setCachedResponse(idempotencyKey, { body: responseBody, status }, 86400);
      }
      return NextResponse.json(responseBody, { status });
    }

    const { data: reservation } = await supabase
      .from('reservations')
      .select('*')
      .eq('id', data as string)
      .maybeSingle();

    const responseBody = { reservation_id: data, reservation };
    const status = 201;

    if (idempotencyKey) {
      await setCachedResponse(idempotencyKey, { body: responseBody, status }, 86400);
    }

    return NextResponse.json(responseBody, { status });
  } finally {
    // 4. Always release distributed lock
    await releaseLock(lockKey);
  }
}


export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const session_id = req.nextUrl.searchParams.get('session_id');

  if (!session_id) {
    return NextResponse.json({ error: 'missing session_id' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('reservations')
    .select('*, product:products(*), warehouse:warehouses(*)')
    .eq('session_id', session_id)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}
