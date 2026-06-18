import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, CartesianGrid } from 'recharts';
import { Card } from '@/components/ui/card';
import OverviewPlannedVsActual from './OverviewPlannedVsActual.jsx';
import OverviewFiscalSummary from './OverviewFiscalSummary.jsx';
import CategoryAuditDrawer from './CategoryAuditDrawer.jsx';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function AtividadeTab({ data, byMonth6, fiscal, grouping, incluirCartao, onOpenConsolidated, currentMonth }) {
  const [drawer, setDrawer] = useState(null); // { categoryName, total, items }

  const aggregation = grouping === 'root' ? data.byCategoryRoot : data.byCategoryLeaf;

  // Top 6 + Demais para o donut
  const top6 = aggregation.slice(0, 6);
  const demais = aggregation.slice(6);
  const demaisTotal = demais.reduce((s, i) => s + i.total, 0);
  const donutData = demaisTotal > 0
    ? [...top6, { categoryName: 'Demais', color: '#E2E8F0', total: demaisTotal, items: demais.flatMap(i => i.items) }]
    : top6;

  return (
    <div className="space-y-6">
      {/* Banner info */}
      <div className="bg-white border-[0.5px] border-[#E8EDF2] border-l-[4px] border-l-[#0D3B66] rounded-xl py-4 px-[18px] flex items-center justify-between gap-4">
        <div>
          <h3 className="text-[14px] font-bold text-[#0D3B66] mb-0.5">
            {incluirCartao ? 'Atividade do mês — gastos efetivos + compromissos de cartão' : 'Atividade do mês — apenas gastos efetivos em caixa'}
          </h3>
          <p className="text-[12px] text-[#7B92A8]">Total: {fmt(data.total)}</p>
        </div>
        <button
          onClick={onOpenConsolidated}
          className="bg-[#0D3B66] hover:bg-[#0a2f54] text-white rounded-lg py-2 px-4 text-[12px] font-bold cursor-pointer whitespace-nowrap shrink-0 transition-colors shadow-sm"
        >
          Relatório Consolidado
        </button>
      </div>

      {/* Bug 4: card vermelho para itens sem categoria — topo da aba */}
      {data.semCategoria?.count > 0 && (
        <button
          onClick={() => setDrawer({ categoryName: 'Sem Categoria', total: data.semCategoria.total, items: data.semCategoria.items })}
          className="w-full flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-3 hover:bg-red-100 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <span className="text-sm font-bold text-red-700">
              {data.semCategoria.count} {data.semCategoria.count === 1 ? 'registro sem categoria' : 'registros sem categoria'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-bold text-red-700">{fmt(data.semCategoria.total)}</span>
            <span className="text-xs text-red-500 underline">classificar →</span>
          </div>
        </button>
      )}

      {/* Fluxo de Caixa 6 meses */}
      <Card className="bg-white border-[0.5px] border-[#E8EDF2] rounded-[16px] p-5">
        <h3 className="text-[13px] font-bold text-[#0D3B66] mb-4">Fluxo de Caixa — Últimos 6 Meses</h3>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byMonth6} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#F0F4F8" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#7B92A8', fontSize: 11 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#7B92A8', fontSize: 10 }} tickFormatter={v => `R$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
              <Tooltip
                cursor={{ fill: 'rgba(13,59,102,0.05)' }}
                contentStyle={{ backgroundColor: '#0D3B66', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '11px' }}
                formatter={(v) => [fmt(v), '']}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', color: '#7B92A8', paddingTop: '10px' }} />
              <Bar dataKey="Receitas" fill="#0FA3A3" radius={[6, 6, 0, 0]} barSize={24} />
              <Bar dataKey="Despesas" fill="#F08080" radius={[6, 6, 0, 0]} barSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Donut despesas */}
      <Card className="bg-white border-[0.5px] border-[#E8EDF2] rounded-[16px] p-5">
        <h3 className="text-[13px] font-bold text-[#0D3B66] mb-4">Despesas por Categoria</h3>
        {donutData.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">Nenhuma despesa neste mês</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[200px_1fr] items-center">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData.map(i => ({ name: i.categoryName, value: i.total }))} cx="50%" cy="50%" innerRadius="60%" outerRadius={80} dataKey="value" stroke="#fff" strokeWidth={2}>
                    {donutData.map((item, i) => <Cell key={i} fill={item.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#0D3B66', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '11px' }} formatter={(v) => [fmt(v), '']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 max-h-[200px] overflow-auto">
              {donutData.map((item, i) => (
                <button
                  key={i}
                  onClick={() => setDrawer({ categoryName: item.categoryName, total: item.total, items: item.items || [] })}
                  className="w-full flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 hover:bg-slate-100 transition-colors text-left"
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="flex-1 text-xs font-medium text-slate-700 truncate">{item.categoryName}</span>
                  <span className="text-xs font-semibold text-slate-800 shrink-0">{fmt(item.total)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Bug 1 + 2: passa aggregation em vez de plannedVsActual */}
      <OverviewPlannedVsActual aggregation={aggregation} currentMonth={currentMonth} />

      <OverviewFiscalSummary
        totalGross={fiscal.totalBruto}
        totalTax={fiscal.totalImpostos}
        totalNet={fiscal.totalLiquido}
        effectiveRate={fiscal.aliquotaEfetiva}
        sourceRows={fiscal.sourceRows}
      />

      <CategoryAuditDrawer
        open={!!drawer}
        onClose={() => setDrawer(null)}
        categoryName={drawer?.categoryName}
        total={drawer?.total}
        items={drawer?.items}
      />
    </div>
  );
}