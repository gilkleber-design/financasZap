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
      <div className="bg-white border-[0.5px] border-[#E8EDF2] border-l-[4px] border-l-amber-400 rounded-xl py-3 px-[18px]">
        <p className="text-sm text-slate-600">
          Contas com competência neste mês — pagas, pendentes e vencidas.
          {incluirCartao && (
            <span className="ml-1 text-slate-400">Total exclui itens já contados em Atividade.</span>
          )}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">Total ajustado: {fmt(data.total)}</p>
      </div>

      <PayableStatusCards byStatus={data.byStatus} />

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