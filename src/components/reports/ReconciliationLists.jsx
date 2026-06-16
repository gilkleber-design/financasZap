import { ArrowUpRight, AlertTriangle } from 'lucide-react';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const STATUS_LABEL = { pending: 'Pendente', provisioned: 'Provisionado', overdue: 'Vencido' };

function safeDate(d) {
  try {
    const s = String(d);
    const [y, m, day] = s.slice(0, 10).split('-');
    return `${day}/${m}`;
  } catch { return '--'; }
}

function monthLabel(m) {
  if (!m) return '?';
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const [y, mo] = m.split('-');
  return `${months[Number(mo) - 1]}/${String(y).slice(2)}`;
}

function ListCard({ icon: Icon, iconColor, title, subtitle, count, total, items, renderRow }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <div className="flex-1">
          <div className="font-semibold text-sm text-slate-800">{title}</div>
          <div className="text-[11px] text-slate-400">{subtitle}</div>
        </div>
        <div className="text-xs font-bold text-slate-600 shrink-0">{count} itens · {fmt(total)}</div>
      </div>
      {items.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-400">Nenhum item</div>
      ) : (
        <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
          {items.map(renderRow)}
        </div>
      )}
    </div>
  );
}

export default function ReconciliationLists({ saiuSemObrigacao, deviaMasNaoSaiu, limbo }) {
  const sso = saiuSemObrigacao || { total: 0, count: 0, items: [] };
  const dmns = deviaMasNaoSaiu || { total: 0, count: 0, items: [] };
  const limboData = limbo || { total: 0, count: 0, items: [] };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ListCard
          icon={ArrowUpRight}
          iconColor="text-slate-500"
          title="Saiu sem obrigação"
          subtitle="Transações avulsas — sem payable correspondente"
          count={sso.count}
          total={sso.total}
          items={sso.items}
          renderRow={(item) => (
            <div key={item.id} className="px-4 py-2.5 flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: item.resolver?.rootColor || '#94A3B8' }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-slate-700 truncate">{item.description}</div>
                <div className="text-[10px] text-slate-400">{safeDate(item.date)} · {item.resolver?.rootName || '—'}</div>
              </div>
              <div className="text-xs font-bold text-slate-800 shrink-0">{fmt(item.amount || item._amount)}</div>
            </div>
          )}
        />

        <ListCard
          icon={AlertTriangle}
          iconColor="text-amber-500"
          title="Devia mas não saiu"
          subtitle="Payables do mês sem transação registrada"
          count={dmns.count}
          total={dmns.total}
          items={dmns.items}
          renderRow={(item) => (
            <div key={item.id} className="px-4 py-2.5 flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: item.resolver?.rootColor || '#94A3B8' }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-slate-700 truncate">{item.description}</div>
                <div className="text-[10px] text-slate-400">{item.dueDate ? safeDate(item.dueDate) : safeDate(item.due_date)} · {item.resolver?.rootName || '—'}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-bold text-slate-800">{fmt(item.amount || item._amount)}</div>
                <div className="text-[10px] text-amber-600">{STATUS_LABEL[item.status] || item.status}</div>
              </div>
            </div>
          )}
        />
      </div>

      <ListCard
        icon={AlertTriangle}
        iconColor="text-red-500"
        title="Limbo — saiu este mês mas o payable está em outro"
        subtitle="Estas despesas somem da aba Contas a Pagar porque a competência do payable não bate com a data da transação"
        count={limboData.count}
        total={limboData.total}
        items={limboData.items}
        renderRow={(item) => (
          <div key={item.id} className="px-4 py-2.5 flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: item.resolver?.rootColor || '#94A3B8' }} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-slate-700 truncate">{item.description}</div>
              <div className="text-[10px] text-slate-400">{safeDate(item.date)} · {item.resolver?.rootName || '—'}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs font-bold text-slate-800">{fmt(item.amount || item._amount)}</div>
              <div className="text-[10px] text-red-500 font-medium">{monthLabel(item.payableCompetenciaMonth)} → {monthLabel(String(item.date).slice(0, 7))}</div>
            </div>
          </div>
        )}
      />
    </div>
  );
}