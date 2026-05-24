import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const body = await req.json();
  const { session_id, product_id, warehouse_id, quantity } = body;

  if (!session_id || !product_id || !warehouse_id || !quantity) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  if (quantity < 1 || quantity > 10) {
    return NextResponse.json({ error: 'invalid_quantity' }, { status: 400 });
  }

  await supabase.rpc('expire_reservations');

  const { data, error } = await supabase.rpc('place_reservation', {
    p_session_id: session_id,
    p_product_id: product_id,
    p_warehouse_id: warehouse_id,
    p_quantity: quantity,
  });

  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('insufficient_stock')) {
      return NextResponse.json({ error: 'insufficient_stock' }, { status: 409 });
    }
    if (msg.includes('inventory_not_found')) {
      return NextResponse.json({ error: 'inventory_not_found' }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { data: reservation } = await supabase
    .from('reservations')
    .select('*')
    .eq('id', data as string)
    .maybeSingle();

  return NextResponse.json({ reservation_id: data, reservation }, { status: 201 });
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
