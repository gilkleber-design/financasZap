import { useState } from 'react';
import PayableStatusCards from './PayableStatusCards.jsx';
import AuditCategoryPieChart from './AuditCategoryPieChart.jsx';
import AuditReportAccordion from './AuditReportAccordion.jsx';
import CategoryAuditDrawer from './CategoryAuditDrawer.jsx';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function ContasAPagarTab({ data, grouping, incluirCartao, onRowClick }) {
  const [drawer, setDrawer] = useState(null);

  const aggregation = grouping === 'root' ? data.byCategoryRoot : data.byCategoryLeaf;

  return (
    <div className="space-y-6">
      {/* Bug 4: card vermelho para itens sem categoria */}
      {data.semCategoria?.count > 0 && (
        <button
          onClick={() => setDrawer({ categoryName: 'Sem Categoria', total: data.semCategoria.total, items: data.semCategoria.items })}
          className="w-full flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-3 hover:bg-red-100 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <span className="text-sm font-bold text-red-700">
              {data.semCategoria.count} {data.semCategoria.count === 1 ? 'conta sem categoria' : 'contas sem categoria'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-bold text-red-700">{fmt(data.semCategoria.total)}</span>
            <span className="text-xs text-red-500 underline">classificar →</span>
          </div>
        </button>
      )}

      {/* Bug 6: banner explicativo */}
      {incluirCartao && data.totalJaContado > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex flex-col gap-1">
          <p className="text-xs text-blue-700 font-medium">
            O total ajustado desconta os Payables já contados na aba Atividade (toggle "Incluir cartão" ON). Os cards abaixo mostram totais brutos.
          </p>
          <div className="flex flex-wrap gap-3 text-xs text-blue-600 mt-0.5">
            <span>Total bruto <b>{fmt(data.totalBruto)}</b></span>
            <span>·</span>
            <span>Já contados em Atividade <b>{fmt(data.totalJaContado)}</b></span>
            <span>·</span>
            <span>Ajustado <b>{fmt(data.total)}</b></span>
          </div>
        </div>
      )}

      <div className="bg-white border-[0.5px] border-[#E8EDF2] border-l-[4px] border-l-amber-400 rounded-xl py-3 px-[18px]">
        <p className="text-sm text-slate-600">
          Contas com competência neste mês — pagas, pendentes e vencidas.
        </p>
        <p className="text-xs text-slate-400 mt-0.5">Total ajustado: {fmt(data.total)}</p>
      </div>

      <PayableStatusCards byStatus={data.byStatus} incluirCartao={incluirCartao} />

      <AuditCategoryPieChart aggregation={aggregation} onCategoryClick={setDrawer} />

      <AuditReportAccordion aggregation={aggregation} onRowClick={onRowClick} onCategoryClick={setDrawer} />

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