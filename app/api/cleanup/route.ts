import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc('expire_reservations');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ expired_count: data });
}
