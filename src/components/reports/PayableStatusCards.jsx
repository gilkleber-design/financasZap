const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const CARDS = [
  { key: 'pagas',         label: 'Pagas',         color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  { key: 'pendentes',     label: 'Pendentes',      color: 'text-slate-600',   bg: 'bg-slate-50',   border: 'border-slate-200',   dot: 'bg-slate-400' },
  { key: 'vencidas',      label: 'Vencidas',       color: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200',     dot: 'bg-red-500' },
  { key: 'provisionadas', label: 'Provisionadas',  color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200',    dot: 'bg-blue-400' },
];

export default function PayableStatusCards({ byStatus }) {
  if (!byStatus) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {CARDS.map(c => {
        const s = byStatus[c.key] || { total: 0, count: 0 };
        return (
          <div key={c.key} className={`rounded-xl border ${c.border} ${c.bg} p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2 h-2 rounded-full ${c.dot}`} />
              <span className={`text-xs font-semibold ${c.color}`}>{c.label}</span>
            </div>
            <div className={`text-xl font-bold ${c.color}`}>{fmt(s.total)}</div>
            <div className="text-xs text-slate-400 mt-0.5">{s.count} {s.count === 1 ? 'item' : 'itens'}</div>
          </div>
        );
      })}
    </div>
  );
}