'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Package,
  Clock,
  Activity,
  RefreshCw,
  ArrowLeft,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  BarChart3,
  Building2,
} from 'lucide-react';
import Link from 'next/link';

interface InventoryRow {
  id: string;
  product_id: string;
  warehouse_id: string;
  total_qty: number;
  reserved_qty: number;
  updated_at: string;
  product: { id: string; name: string; category: string; price: number };
  warehouse: { id: string; name: string; location: string };
}

interface ReservationRow {
  id: string;
  session_id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  status: string;
  expires_at: string;
  created_at: string;
  product: { name: string };
  warehouse: { name: string };
}

type Tab = 'inventory' | 'reservations';

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-stone-100 text-stone-700 border-stone-200',
  confirmed: 'bg-stone-900 text-white border-stone-800',
  expired: 'bg-stone-50 text-stone-400 border-stone-100',
  cancelled: 'bg-red-50 text-red-600 border-red-100',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  active: <Clock className="w-3 h-3" />,
  confirmed: <CheckCircle2 className="w-3 h-3" />,
  expired: <TrendingDown className="w-3 h-3" />,
  cancelled: <XCircle className="w-3 h-3" />,
};

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('inventory');
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, resRes] = await Promise.all([
        fetch('/api/admin/inventory'),
        fetch('/api/admin/reservations'),
      ]);
      const [invData, resData] = await Promise.all([invRes.json(), resRes.json()]);
      setInventory(invData);
      setReservations(resData);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 15_000);
    return () => clearInterval(t);
  }, [fetchData]);

  const runCleanup = async () => {
    setCleaning(true);
    setCleanResult(null);
    try {
      const res = await fetch('/api/cleanup');
      const data = await res.json();
      setCleanResult(data.expired_count);
      await fetchData();
    } finally {
      setCleaning(false);
    }
  };

  const totalUnits = inventory.reduce((s, i) => s + i.total_qty, 0);
  const totalReserved = inventory.reduce((s, i) => s + i.reserved_qty, 0);
  const totalAvailable = totalUnits - totalReserved;
  const activeCount = reservations.filter((r) => r.status === 'active').length;
  const lowStockCount = inventory.filter(
    (i) => (i.total_qty - i.reserved_qty) <= 5 && i.total_qty > 0
  ).length;

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-stone-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl hover:bg-stone-100 transition-colors text-stone-500"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-stone-900 rounded-xl flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-stone-900">Admin</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="text-xs text-stone-400 hidden sm:block">
                Updated {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={runCleanup}
              disabled={cleaning}
              className="flex items-center gap-2 text-xs border border-stone-200 px-3 py-2 rounded-xl hover:bg-stone-50 transition-colors text-stone-600 font-medium disabled:opacity-50"
            >
              {cleaning ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Clock className="w-3.5 h-3.5" />
              )}
              Sweep
            </button>
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 text-xs bg-stone-900 text-white px-3 py-2 rounded-xl hover:bg-stone-700 transition-colors font-medium disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Cleanup result */}
        {cleanResult !== null && (
          <div className="mb-6 flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-600 apple-shadow animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-stone-400" />
            Swept {cleanResult} expired reservation{cleanResult !== 1 ? 's' : ''}.
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            {
              label: 'Available Units',
              value: totalAvailable,
              icon: Package,
              bgClass: 'bg-stone-100',
              iconClass: 'text-stone-600',
            },
            {
              label: 'Reserved Units',
              value: totalReserved,
              icon: Clock,
              bgClass: 'bg-amber-50',
              iconClass: 'text-amber-500',
            },
            {
              label: 'Active Holds',
              value: activeCount,
              icon: Activity,
              bgClass: 'bg-stone-900',
              iconClass: 'text-white',
            },
            {
              label: 'Low Stock SKUs',
              value: lowStockCount,
              icon: AlertTriangle,
              bgClass: 'bg-red-50',
              iconClass: 'text-red-500',
            },
          ].map(({ label, value, icon: Icon, bgClass, iconClass }) => (
            <div
              key={label}
              className="bg-white rounded-2xl border border-stone-200 apple-shadow p-5 animate-fade-up opacity-0"
              style={{ animationDelay: '0ms', animationFillMode: 'forwards' }}
            >
              <div className={`w-10 h-10 ${bgClass} rounded-xl flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${iconClass}`} />
              </div>
              <p className="text-2xl font-bold text-stone-900 tabular-nums">{value}</p>
              <p className="text-xs text-stone-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 bg-white rounded-full p-1 border border-stone-200 apple-shadow w-fit mb-6">
          {(['inventory', 'reservations'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-full text-sm font-medium capitalize transition-all ${
                tab === t
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              {t}
              {t === 'reservations' && activeCount > 0 && (
                <span className="ml-1.5 bg-stone-700 text-white text-xs rounded-full px-1.5 py-0.5">
                  {activeCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Inventory table */}
        {tab === 'inventory' && (
          <div className="bg-white rounded-2xl border border-stone-200 apple-shadow overflow-hidden animate-fade-in">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50/50">
                    <th className="text-left px-5 py-3 font-semibold text-stone-600">Product</th>
                    <th className="text-left px-5 py-3 font-semibold text-stone-600 hidden md:table-cell">Category</th>
                    <th className="text-left px-5 py-3 font-semibold text-stone-600">Warehouse</th>
                    <th className="text-right px-5 py-3 font-semibold text-stone-600">Total</th>
                    <th className="text-right px-5 py-3 font-semibold text-stone-600">Reserved</th>
                    <th className="text-right px-5 py-3 font-semibold text-stone-600">Available</th>
                    <th className="text-center px-5 py-3 font-semibold text-stone-600">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {inventory.map((row) => {
                    const available = row.total_qty - row.reserved_qty;
                    const pct = row.total_qty > 0 ? available / row.total_qty : 0;
                    const stockStatus =
                      available === 0
                        ? 'out'
                        : pct <= 0.2
                        ? 'critical'
                        : pct <= 0.4
                        ? 'low'
                        : 'ok';

                    return (
                      <tr key={row.id} className="hover:bg-stone-50/50 transition-colors">
                        <td className="px-5 py-4">
                          <p className="font-medium text-stone-900">{row.product?.name}</p>
                        </td>
                        <td className="px-5 py-4 hidden md:table-cell">
                          <span className="capitalize text-stone-400 text-xs">
                            {row.product?.category}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5 text-stone-500">
                            <Building2 className="w-3.5 h-3.5" />
                            <span className="text-xs">{row.warehouse?.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right tabular-nums text-stone-600">
                          {row.total_qty}
                        </td>
                        <td className="px-5 py-4 text-right tabular-nums">
                          <span
                            className={`font-medium ${
                              row.reserved_qty > 0 ? 'text-amber-600' : 'text-stone-300'
                            }`}
                          >
                            {row.reserved_qty}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right tabular-nums font-semibold">
                          <span
                            className={
                              stockStatus === 'out'
                                ? 'text-stone-400'
                                : stockStatus === 'critical'
                                ? 'text-red-500'
                                : stockStatus === 'low'
                                ? 'text-amber-500'
                                : 'text-stone-900'
                            }
                          >
                            {available}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-center">
                            <div className="w-16 bg-stone-100 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full transition-all ${
                                  stockStatus === 'out'
                                    ? 'bg-stone-200'
                                    : stockStatus === 'critical'
                                    ? 'bg-red-300'
                                    : stockStatus === 'low'
                                    ? 'bg-amber-300'
                                    : 'bg-stone-900'
                                }`}
                                style={{ width: `${pct * 100}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {inventory.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-16 text-center text-stone-400">
                        No inventory data
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Reservations table */}
        {tab === 'reservations' && (
          <div className="bg-white rounded-2xl border border-stone-200 apple-shadow overflow-hidden animate-fade-in">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50/50">
                    <th className="text-left px-5 py-3 font-semibold text-stone-600">ID</th>
                    <th className="text-left px-5 py-3 font-semibold text-stone-600">Product</th>
                    <th className="text-left px-5 py-3 font-semibold text-stone-600 hidden md:table-cell">Warehouse</th>
                    <th className="text-right px-5 py-3 font-semibold text-stone-600">Qty</th>
                    <th className="text-left px-5 py-3 font-semibold text-stone-600">Status</th>
                    <th className="text-left px-5 py-3 font-semibold text-stone-600 hidden lg:table-cell">Expires</th>
                    <th className="text-left px-5 py-3 font-semibold text-stone-600 hidden lg:table-cell">Session</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {reservations.map((r) => {
                    const isActive = r.status === 'active';
                    const expiresMs = new Date(r.expires_at).getTime() - Date.now();
                    const expiresSoon = isActive && expiresMs < 60_000;

                    return (
                      <tr key={r.id} className="hover:bg-stone-50/50 transition-colors">
                        <td className="px-5 py-4">
                          <span className="font-mono text-xs text-stone-400">
                            {r.id.slice(0, 8).toUpperCase()}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-medium text-stone-900 text-xs">{r.product?.name}</p>
                        </td>
                        <td className="px-5 py-4 hidden md:table-cell text-xs text-stone-400">
                          {r.warehouse?.name}
                        </td>
                        <td className="px-5 py-4 text-right tabular-nums text-stone-600">
                          {r.quantity}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${
                              STATUS_STYLES[r.status] ?? ''
                            }`}
                          >
                            {STATUS_ICONS[r.status]}
                            {r.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 hidden lg:table-cell">
                          {isActive ? (
                            <span
                              className={`text-xs font-mono ${
                                expiresSoon ? 'text-amber-500 font-semibold' : 'text-stone-400'
                              }`}
                            >
                              {expiresMs > 0
                                ? `${Math.floor(expiresMs / 60000)}m ${Math.floor(
                                    (expiresMs % 60000) / 1000
                                  )}s`
                                : 'Expiring…'}
                            </span>
                          ) : (
                            <span className="text-xs text-stone-300">
                              {new Date(r.expires_at).toLocaleTimeString()}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 hidden lg:table-cell">
                          <span className="font-mono text-xs text-stone-300">
                            {r.session_id.slice(0, 8)}…
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {reservations.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-16 text-center text-stone-400">
                        No reservations yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
