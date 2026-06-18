import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function AuditCategoryPieChart({ aggregation = [], onCategoryClick }) {
  const total = aggregation.reduce((s, i) => s + i.total, 0);
  if (!aggregation.length) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr] items-center rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={aggregation.map(i => ({ name: i.name, value: i.total }))} cx="50%" cy="50%" innerRadius={55} outerRadius={88} paddingAngle={3} dataKey="value">
              {aggregation.map((item, i) => <Cell key={i} fill={item.color || '#94A3B8'} />)}
            </Pie>
            <Tooltip formatter={(v) => fmt(v)} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-slate-950">Despesas por categoria</h3>
          <p className="text-sm text-muted-foreground">Total: {fmt(total)}</p>
        </div>
        <div className="space-y-1.5 max-h-[240px] overflow-auto pr-1">
          {aggregation.map((item, i) => {
            const pct = total > 0 ? (item.total / total * 100).toFixed(1) : 0;
            return (
              <button
                key={i}
                onClick={() => onCategoryClick && onCategoryClick({ categoryName: item.name, total: item.total, items: item.items })}
                className="w-full flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 hover:bg-slate-100 transition-colors text-left"
              >
                <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: item.color || '#94A3B8' }} />
                <span className="flex-1 truncate text-sm font-medium text-slate-700">{item.name}</span>
                <span className="text-sm font-semibold text-slate-950 shrink-0">{fmt(item.total)}</span>
                <span className="text-xs text-muted-foreground w-10 text-right shrink-0">{pct}%</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}