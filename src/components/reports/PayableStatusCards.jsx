import { useMemo } from 'react';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function PayableStatusCards({ payables }) {
  const today = new Date().toISOString().slice(0, 10);

  const stats = useMemo(() => {
    const pagas = payables.filter(p => p.status === 'paid' || p.status === 'conciliated');
    const pendentes = payables.filter(p => p.status === 'pending' && p.due_date >= today);
    const vencidas = payables.filter(p => p.status === 'pending' && p.due_date < today);
    const provisionadas = payables.filter(p => p.status === 'provisioned');

    const sum = (arr) => arr.reduce((s, p) => s + (p.amount || 0), 0);

    return [
      { label: 'Pagas', count: pagas.length, total: sum(pagas), color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
      { label: 'Pendentes', count: pendentes.length, total: sum(pendentes), color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200', dot: 'bg-slate-400' },
      { label: 'Vencidas', count: vencidas.length, total: sum(vencidas), color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500' },
      { label: 'Provisionadas', count: provisionadas.length, total: sum(provisionadas), color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200', dot: 'bg-slate-300' },
    ];
  }, [payables, today]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map(s => (
        <div key={s.label} className={`rounded-xl border ${s.border} ${s.bg} p-4`}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-2 h-2 rounded-full ${s.dot}`} />
            <span className={`text-xs font-semibold ${s.color}`}>{s.label}</span>
          </div>
          <div className={`text-xl font-bold ${s.color}`}>{fmt(s.total)}</div>
          <div className="text-xs text-slate-400 mt-0.5">{s.count} {s.count === 1 ? 'item' : 'itens'}</div>
        </div>
      ))}
    </div>
  );
}