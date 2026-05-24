'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Clock,
  Package,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  MapPin,
  ShieldCheck,
  Loader2,
  CreditCard,
  Mail,
  X,
} from 'lucide-react';

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

interface ReservationDetail {
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
    description: string;
    price: number;
    image_url: string;
    category: string;
  };
  warehouse: {
    id: string;
    name: string;
    location: string;
  };
}

type PageState = 'loading' | 'active' | 'expired' | 'confirmed' | 'error' | 'not_found' | 'cancelled';

export default function CheckoutPage({
  params,
}: {
  params: { reservationId: string };
}) {
  const router = useRouter();
  const [reservation, setReservation] = useState<ReservationDetail | null>(null);
  const [pageState, setPageState] = useState<PageState>('loading');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<{ id: string; total_price: number } | null>(null);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const sessionId = getSessionId();

    const load = async () => {
      const res = await fetch(`/api/reservations/${params.reservationId}`);
      if (!res.ok) {
        setPageState('not_found');
        return;
      }

      const data: ReservationDetail = await res.json();

      if (data.session_id !== sessionId) {
        setPageState('not_found');
        return;
      }

      if (data.status !== 'active') {
        setPageState(data.status === 'confirmed' ? 'confirmed' : 'expired');
        return;
      }

      const ms = new Date(data.expires_at).getTime() - Date.now();
      if (ms <= 0) {
        setPageState('expired');
        return;
      }

      setReservation(data);
      setSecondsLeft(Math.floor(ms / 1000));
      setPageState('active');
    };

    load().catch(() => setPageState('error'));
  }, [params.reservationId]);

  useEffect(() => {
    if (pageState !== 'active') return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          setPageState('expired');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [pageState]);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!email.includes('@')) {
      setFormError('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/reservations/${params.reservationId}/confirm`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID()
        },
        body: JSON.stringify({
          session_id: getSessionId(),
          customer_email: email,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'reservation_expired') {
          setPageState('expired');
          return;
        }
        setFormError(data.error ?? 'Checkout failed.');
        return;
      }

      setOrder(data.order);
      setPageState('confirmed');
    } catch {
      setFormError('Network error.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    setSubmitting(true);
    setFormError('');
    try {
      const res = await fetch(`/api/reservations/${params.reservationId}/release`, {
        method: 'POST',
      });

      if (!res.ok) {
        setFormError('Failed to cancel the reservation.');
        return;
      }

      setPageState('cancelled');
    } catch {
      setFormError('Network error while cancelling.');
    } finally {
      setSubmitting(false);
    }
  };

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const isUrgent = secondsLeft < 120 && pageState === 'active';
  const progress = (secondsLeft / 600) * 100;

  // ── States ─────────────────────────────────────────────────────────────

  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <Loader2 className="w-8 h-8 animate-spin text-stone-400 mx-auto mb-3" />
          <p className="text-stone-500 text-sm">Loading reservation…</p>
        </div>
      </div>
    );
  }

  if (pageState === 'not_found' || pageState === 'error') {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm animate-scale-in">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-2xl font-semibold text-stone-900 mb-2">Reservation not found</h1>
          <p className="text-stone-500 text-sm mb-8">
            This reservation doesn't exist or belongs to a different session.
          </p>
          <button
            onClick={() => router.push('/')}
            className="bg-stone-900 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-stone-700 transition-colors"
          >
            Back to store
          </button>
        </div>
      </div>
    );
  }

  if (pageState === 'expired') {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm animate-scale-in">
          <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <Clock className="w-8 h-8 text-stone-400" />
          </div>
          <h1 className="text-2xl font-semibold text-stone-900 mb-2">Hold expired</h1>
          <p className="text-stone-500 text-sm mb-8">
            Your 10-minute reservation window has passed. The stock was released back to inventory.
          </p>
          <button
            onClick={() => router.push('/')}
            className="bg-stone-900 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-stone-700 transition-colors"
          >
            Browse products
          </button>
        </div>
      </div>
    );
  }

  if (pageState === 'cancelled') {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm animate-scale-in">
          <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <X className="w-8 h-8 text-stone-500" />
          </div>
          <h1 className="text-2xl font-semibold text-stone-900 mb-2">Reservation cancelled</h1>
          <p className="text-stone-500 text-sm mb-8">
            You have cancelled your reservation. The stock has been released back to inventory.
          </p>
          <button
            onClick={() => router.push('/')}
            className="bg-stone-900 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-stone-700 transition-colors"
          >
            Browse products
          </button>
        </div>
      </div>
    );
  }

  if (pageState === 'confirmed' && order) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm animate-scale-in">
          <div className="w-20 h-20 bg-stone-900 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-stone-900 mb-2">Order confirmed</h1>
          <p className="text-stone-500 text-sm mb-6">
            Order <span className="font-mono font-medium text-stone-700">#{order.id.slice(0, 8).toUpperCase()}</span>
            <br />
            Total: <span className="font-semibold text-stone-900">${order.total_price.toFixed(2)}</span>
          </p>
          <div className="bg-stone-100 rounded-2xl p-4 text-left mb-6">
            <p className="text-xs font-medium text-stone-600 mb-2">What happens next?</p>
            <ul className="text-xs text-stone-500 space-y-1.5">
              <li className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5" />
                Confirmation email sent
              </li>
              <li className="flex items-center gap-2">
                <Package className="w-3.5 h-3.5" />
                Warehouse processes within 24h
              </li>
              <li className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" />
                Delivery in 2–4 business days
              </li>
            </ul>
          </div>
          <button
            onClick={() => router.push('/')}
            className="bg-stone-900 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-stone-700 transition-colors"
          >
            Continue shopping
          </button>
        </div>
      </div>
    );
  }

  if (!reservation) return null;

  const { product, warehouse } = reservation;
  const total = product.price * reservation.quantity;

  // ── Active checkout ─────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-stone-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="p-2 rounded-xl hover:bg-stone-100 transition-colors text-stone-500"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-semibold text-stone-900">Checkout</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Timer */}
        <div
          className={`rounded-2xl p-5 mb-8 border transition-all duration-500 ${
            isUrgent
              ? 'bg-amber-50 border-amber-200'
              : 'bg-white border-stone-200 apple-shadow'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  isUrgent ? 'bg-amber-100' : 'bg-stone-100'
                }`}
              >
                <Clock
                  className={`w-5 h-5 ${isUrgent ? 'text-amber-500 animate-pulse-soft' : 'text-stone-500'}`}
                />
              </div>
              <div>
                <p className={`font-medium text-sm ${isUrgent ? 'text-amber-700' : 'text-stone-900'}`}>
                  {isUrgent ? 'Hold expiring soon' : 'Stock reserved for you'}
                </p>
                <p className={`text-xs ${isUrgent ? 'text-amber-600' : 'text-stone-500'}`}>
                  Complete checkout before stock is released
                </p>
              </div>
            </div>
            <div className="text-right">
              <span
                className={`font-mono font-bold text-xl tracking-tight ${
                  isUrgent ? 'text-amber-600' : 'text-stone-900'
                }`}
              >
                {mins}:{secs.toString().padStart(2, '0')}
              </span>
            </div>
          </div>
          <div className={`w-full rounded-full h-2 ${isUrgent ? 'bg-amber-200' : 'bg-stone-100'}`}>
            <div
              className={`h-2 rounded-full transition-all duration-1000 ${
                isUrgent ? 'bg-amber-400' : 'bg-stone-900'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Order summary */}
          <div className="lg:col-span-2 order-2 lg:order-1">
            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden apple-shadow">
              <div className="p-5 border-b border-stone-100">
                <h2 className="font-semibold text-stone-900">Order Summary</h2>
              </div>
              <div className="p-5">
                <div className="flex gap-4 mb-5">
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-20 h-20 rounded-xl object-cover flex-shrink-0 bg-stone-100"
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-stone-900 text-sm leading-snug">{product.name}</p>
                    <p className="text-stone-400 text-xs mt-1 capitalize">{product.category}</p>
                    <p className="text-stone-600 text-sm font-medium mt-2">Qty: {reservation.quantity}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-stone-500 bg-stone-50 rounded-xl px-3 py-2.5 mb-5">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  Ships from <span className="font-medium text-stone-700">{warehouse.name}</span>
                </div>

                <div className="space-y-2.5 text-sm mb-5">
                  <div className="flex justify-between text-stone-600">
                    <span>Subtotal</span>
                    <span>${(product.price * reservation.quantity).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>Shipping</span>
                    <span className="text-stone-900 font-medium">Free</span>
                  </div>
                  <div className="border-t border-stone-100 pt-2.5 flex justify-between font-semibold text-stone-900">
                    <span>Total</span>
                    <span>${total.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-stone-400 bg-stone-50 rounded-xl px-3 py-2.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-stone-300 flex-shrink-0" />
                  Reservation: <span className="font-mono text-stone-500">{params.reservationId.slice(0, 8).toUpperCase()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment form */}
          <div className="lg:col-span-3 order-1 lg:order-2">
            <div className="bg-white rounded-2xl border border-stone-200 apple-shadow">
              <div className="p-5 border-b border-stone-100">
                <h2 className="font-semibold text-stone-900">Payment Details</h2>
                <p className="text-stone-400 text-xs mt-1">Demo mode — pre-filled card</p>
              </div>

              <form onSubmit={handleConfirm} className="p-5 space-y-5">
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="w-full border border-stone-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/20 focus:border-stone-400 text-stone-900 placeholder:text-stone-300 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">
                    Card number
                  </label>
                  <div className="relative">
                    <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                    <input
                      type="text"
                      defaultValue="4242 4242 4242 4242"
                      readOnly
                      className="w-full border border-stone-200 rounded-xl pl-10 pr-4 py-2.5 text-sm bg-stone-50 text-stone-500 cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-stone-600 mb-1.5">Expiry</label>
                    <input
                      type="text"
                      defaultValue="12/28"
                      readOnly
                      className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm bg-stone-50 text-stone-500 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-600 mb-1.5">CVV</label>
                    <input
                      type="text"
                      defaultValue="123"
                      readOnly
                      className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm bg-stone-50 text-stone-500 cursor-not-allowed"
                    />
                  </div>
                </div>

                {formError && (
                  <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-xl px-4 py-3 border border-red-100">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {formError}
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-stone-900 text-white font-medium py-3.5 px-6 rounded-xl hover:bg-stone-700 active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing…
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        Confirm Order · ${total.toFixed(2)}
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={submitting}
                    className="w-full bg-white hover:bg-stone-50 text-stone-600 border border-stone-200 font-medium py-3 px-6 rounded-xl active:scale-[0.99] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Cancel Reservation
                  </button>
                </div>

                <p className="text-center text-xs text-stone-400">
                  By confirming, you agree to our terms. Demo payment simulation.
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
