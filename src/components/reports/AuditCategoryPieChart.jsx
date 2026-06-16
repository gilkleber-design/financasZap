import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { categorizeByRoot } from '@/lib/categoryHierarchy';

const fmt = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

export default function AuditCategoryPieChart({ auditData, categories }) {
  const chartData = useMemo(() => {
    const grouped = {};
    (auditData || []).forEach(item => {
      const { rootId, rootName, rootColor } = categorizeByRoot(item, categories || []);
      if (!grouped[rootId]) {
        grouped[rootId] = { name: rootName, value: 0, color: rootColor };
      }
      grouped[rootId].value += Number(item.amount || 0);
    });

    return Object.values(grouped).sort((a, b) => b.value - a.value);
  }, [auditData, categories]);

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  if (!chartData.length) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr] items-center rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => fmt(value)} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-slate-950">Despesas por categoria</h3>
          <p className="text-sm text-muted-foreground">Total: {fmt(total)}</p>
        </div>

        <div className="space-y-2 max-h-[260px] overflow-auto pr-1">
          {chartData.map((item) => {
            const percent = total > 0 ? (item.value / total) * 100 : 0;
            return (
              <div key={item.name} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="truncate text-sm font-medium text-slate-700">{item.name}</span>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-slate-950">{fmt(item.value)}</div>
                  <div className="text-xs text-muted-foreground">{percent.toFixed(1)}%</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}