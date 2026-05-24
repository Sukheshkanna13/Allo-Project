import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient();
  const { action } = await req.json();

  if (!['cancel', 'confirm'].includes(action)) {
    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  }

  const newStatus = action === 'cancel' ? 'cancelled' : 'confirmed';

  const { error } = await supabase.rpc('release_reservation', {
    p_reservation_id: params.id,
    p_new_status: newStatus,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, status: newStatus });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('reservations')
    .select('*, product:products(*), warehouse:warehouses(*)')
    .eq('id', params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json(data);
}
