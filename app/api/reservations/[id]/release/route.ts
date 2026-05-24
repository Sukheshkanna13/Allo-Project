import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient();

  const { error } = await supabase.rpc('release_reservation', {
    p_reservation_id: params.id,
    p_new_status: 'cancelled',
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, status: 'cancelled' });
}
