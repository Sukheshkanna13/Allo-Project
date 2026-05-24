import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  const supabase = createServerClient();

  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: inventory } = await supabase
    .from('inventory')
    .select('*, warehouse:warehouses(*)');

  const enriched = (products ?? []).map((p) => {
    const inv = (inventory ?? []).filter((i) => i.product_id === p.id);
    const total_available = inv.reduce(
      (sum, i) => sum + (i.total_qty - i.reserved_qty),
      0
    );
    // Convert price to number if it's a string (numeric column)
    const price = typeof p.price === 'string' ? parseFloat(p.price) : p.price;
    return { ...p, price, inventory: inv, total_available };
  });

  return NextResponse.json(enriched);
}
