'use client';

import { useEffect, useState } from 'react';
import {
  Activity,
  Package,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Clock,
  X,
  AlertCircle,
  CheckCircle2,
  Plus,
  Minus,
  Building2,
  ChevronDown,
} from 'lucide-react';
import type { ProductWithInventory, Warehouse } from '@/lib/database.types';

const SESSION_KEY = 'allo_session_id';

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

type Category = 'all' | 'diagnostics' | 'supplements';

// ─────────────────────────────────────────────────────────────────────
// Reservation Banner
// ─────────────────────────────────────────────────────────────────────

interface BannerProps {
  reservationId: string;
  expiresAt: string;
  onDismiss: () => void;
}

function ReservationBanner({ reservationId, expiresAt, onDismiss }: BannerProps) {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const ms = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.floor(ms / 1000));
  });

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const urgent = secondsLeft < 120 && secondsLeft > 0;
  const expired = secondsLeft === 0;

  return (
    <div
      className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md rounded-2xl shadow-2xl border transition-all duration-500 animate-slide-up ${
        expired
          ? 'bg-stone-800 border-stone-700 text-white'
          : urgent
          ? 'bg-amber-50 border-amber-200 text-amber-900'
          : 'bg-white border-stone-200 text-stone-900'
      }`}
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              expired ? 'bg-stone-700' : urgent ? 'bg-amber-100' : 'bg-stone-100'
            }`}
          >
            {expired ? (
              <AlertCircle className="w-5 h-5 text-stone-300" />
            ) : urgent ? (
              <Clock className="w-5 h-5 text-amber-600 animate-pulse-soft" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-stone-600" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            {expired ? (
              <p className="font-medium text-sm text-stone-300">Hold expired — stock released</p>
            ) : (
              <>
                <p className="font-medium text-sm text-stone-900">Stock reserved for you</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-stone-500">Expires in</span>
                  <span className={`font-mono font-semibold tracking-tight ${urgent ? 'text-amber-600' : 'text-stone-900'}`}>
                    {mins}:{secs.toString().padStart(2, '0')}
                  </span>
                </div>
              </>
            )}
          </div>
          {!expired && (
            <a
              href={`/checkout/${reservationId}`}
              className="flex-shrink-0 bg-stone-900 text-white text-xs font-medium px-4 py-2 rounded-xl hover:bg-stone-700 active:scale-95 transition-all"
            >
              Checkout
            </a>
          )}
          <button
            onClick={onDismiss}
            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-stone-100/50 transition-colors"
          >
            <X className="w-4 h-4 text-stone-400" />
          </button>
        </div>
        {!expired && (
          <div className="mt-3 mx-1">
            <div className="w-full bg-stone-100 rounded-full h-1 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${urgent ? 'bg-amber-400' : 'bg-stone-900'}`}
                style={{ width: `${(secondsLeft / 600) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Product Card
// ─────────────────────────────────────────────────────────────────────

interface ProductCardProps {
  product: ProductWithInventory;
  onReserved: (id: string, expires: string) => void;
  index: number;
}

function ProductCard({ product, onReserved, index }: ProductCardProps) {
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(
    product.inventory[0]?.warehouse_id ?? ''
  );
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedInv = product.inventory.find((i) => i.warehouse_id === selectedWarehouseId);
  const available = selectedInv ? selectedInv.total_qty - selectedInv.reserved_qty : 0;
  const stockStatus = available === 0 ? 'out' : available <= 5 ? 'low' : 'good';

  const handleReserve = async () => {
    setError('');
    setLoading(true);
    try {
      const session_id = getSessionId();
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID()
        },
        body: JSON.stringify({
          session_id,
          product_id: product.id,
          warehouse_id: selectedWarehouseId,
          quantity,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msgs: Record<string, string> = {
          insufficient_stock: 'Not enough stock at this warehouse.',
          inventory_not_found: 'Inventory record not found.',
          active_reservation_exists: 'You already have an active reservation hold. Please complete checkout or cancel it first.',
        };
        setError(msgs[data.error] ?? 'Something went wrong.');
        return;
      }

      onReserved(data.reservation_id, data.reservation.expires_at);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="group bg-white rounded-2xl overflow-hidden border border-stone-100 apple-shadow hover:apple-shadow-hover transition-all duration-300 flex flex-col animate-fade-up opacity-0"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Image */}
      <div className="relative overflow-hidden bg-stone-50 aspect-[4/3]">
        <img
          src={product.image_url}
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />

        {/* Category badge */}
        <div className="absolute top-4 left-4">
          <span className="glass-card text-xs font-medium text-stone-600 px-3 py-1.5 rounded-full border border-white/50 capitalize">
            {product.category}
          </span>
        </div>

        {/* Stock badge */}
        {stockStatus === 'out' && (
          <div className="absolute inset-0 bg-stone-900/50 backdrop-blur-[2px] flex items-center justify-center">
            <span className="bg-white text-stone-900 text-xs font-semibold px-4 py-2 rounded-full">
              Out of Stock
            </span>
          </div>
        )}
        {stockStatus === 'low' && available > 0 && (
          <div className="absolute top-4 right-4">
            <span className="bg-amber-50/90 backdrop-blur text-amber-700 text-xs font-medium px-2.5 py-1 rounded-full border border-amber-200/50 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {available} left
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col flex-1 gap-4">
        <div>
          <h3 className="font-semibold text-stone-900 leading-snug">{product.name}</h3>
          <p className="text-sm text-stone-500 mt-1.5 line-clamp-2 leading-relaxed">
            {product.description}
          </p>
        </div>

        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-semibold text-stone-900 tracking-tight">
            ${typeof product.price === 'number' ? product.price.toFixed(2) : product.price}
          </span>
          <div className="flex items-center gap-1.5 text-xs text-stone-400">
            <Package className="w-3.5 h-3.5" />
            <span>{product.total_available} total</span>
          </div>
        </div>

        {/* Warehouse selector */}
        {product.inventory.length > 1 && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-500">Warehouse</label>
            <div className="relative">
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2.5 pr-10 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-300 text-stone-700 transition-all"
              >
                {product.inventory.map((inv) => {
                  const avail = inv.total_qty - inv.reserved_qty;
                  const wh = inv.warehouse as unknown as Warehouse;
                  return (
                    <option key={inv.warehouse_id} value={inv.warehouse_id} disabled={avail === 0}>
                      {wh?.name ?? inv.warehouse_id} — {avail > 0 ? `${avail} units` : 'Out'}
                    </option>
                  );
                })}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
            </div>
          </div>
        )}

        {/* Quantity */}
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-stone-500">Quantity</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 hover:bg-stone-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-10 text-center font-medium text-stone-900">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => Math.min(Math.min(available, 10), q + 1))}
              disabled={quantity >= Math.min(available, 10)}
              className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 hover:bg-stone-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2.5 border border-red-100">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={handleReserve}
          disabled={available === 0 || loading}
          className="mt-auto w-full flex items-center justify-center gap-2 bg-stone-900 text-white text-sm font-medium py-3 px-4 rounded-xl hover:bg-stone-700 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <ShoppingCart className="w-4 h-4" />
          )}
          {loading ? 'Reserving…' : available === 0 ? 'Out of Stock' : 'Reserve'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────

export default function StorefrontPage() {
  const [products, setProducts] = useState<ProductWithInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<Category>('all');
  const [activeReservation, setActiveReservation] = useState<{
    id: string;
    expiresAt: string;
  } | null>(null);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      setProducts(data);
    } finally {
      setLoading(false);
    }
  };

  const checkActiveReservation = async () => {
    try {
      const sessionId = getSessionId();
      if (!sessionId) return;
      const res = await fetch(`/api/reservations?session_id=${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        const active = data.find(
          (r: any) => r.status === 'active' && new Date(r.expires_at).getTime() > Date.now()
        );
        if (active) {
          setActiveReservation({ id: active.id, expiresAt: active.expires_at });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchProducts();
    checkActiveReservation();
    const t = setInterval(fetchProducts, 30_000);
    return () => clearInterval(t);
  }, []);

  const filtered = category === 'all' ? products : products.filter((p) => p.category === category);

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-stone-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-stone-900 rounded-xl flex items-center justify-center">
                <Activity className="w-4.5 h-4.5 text-white" />
              </div>
              <span className="font-semibold text-stone-900 text-lg tracking-tight">Allo Health</span>
            </div>
            <nav className="flex items-center gap-1">
              <a href="#" className="text-sm text-stone-900 font-medium px-4 py-2 rounded-full bg-stone-100 transition-colors">
                Products
              </a>
              <a href="/admin" className="text-sm text-stone-600 px-4 py-2 rounded-full hover:text-stone-900 hover:bg-stone-100 transition-colors">
                Admin
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-white border-b border-stone-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24">
          <div className="max-w-2xl animate-fade-up">
            <div className="inline-flex items-center gap-2 bg-stone-100 text-stone-600 text-xs font-medium px-3 py-1.5 rounded-full mb-6">
              <ShieldCheck className="w-3.5 h-3.5 text-stone-500" />
              Atomic inventory reservation
            </div>
            <h1 className="text-4xl md:text-5xl font-semibold text-stone-900 tracking-tight leading-tight mb-5">
              Precision health,
              <br />
              <span className="text-stone-400">delivered to you.</span>
            </h1>
            <p className="text-stone-500 text-lg leading-relaxed mb-8">
              Lab-grade diagnostics and pharmaceutical-quality supplements.
              Stock is reserved the moment you click — no double-booking, ever.
            </p>
            <div className="flex flex-wrap gap-6 text-sm text-stone-400">
              {[
                { icon: Building2, label: '3 Warehouses' },
                { icon: ShieldCheck, label: 'Atomic Holds' },
                { icon: Clock, label: '10-min Window' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-stone-400" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Catalog */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        {/* Filter */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-1 bg-white rounded-full p-1 border border-stone-200 apple-shadow">
            {(['all', 'diagnostics', 'supplements'] as Category[]).map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-4 py-2 rounded-full text-sm font-medium capitalize transition-all ${
                  category === c
                    ? 'bg-stone-900 text-white'
                    : 'text-stone-500 hover:text-stone-700'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <button
            onClick={fetchProducts}
            className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-700 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-stone-100 overflow-hidden animate-pulse">
                <div className="aspect-[4/3] bg-stone-100" />
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-stone-100 rounded w-3/4" />
                  <div className="h-3 bg-stone-100 rounded w-full" />
                  <div className="h-10 bg-stone-100 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 text-stone-400">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-40" />
            <p>No products found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((product, i) => (
              <ProductCard key={product.id} product={product} onReserved={(id, exp) => {
                setActiveReservation({ id, expiresAt: exp });
                fetchProducts();
              }} index={i} />
            ))}
          </div>
        )}
      </main>

      {/* Banner */}
      {activeReservation && (
        <ReservationBanner
          reservationId={activeReservation.id}
          expiresAt={activeReservation.expiresAt}
          onDismiss={() => setActiveReservation(null)}
        />
      )}
    </div>
  );
}
