import { useMemo } from 'react';
import { ArrowUpRight, AlertTriangle } from 'lucide-react';
import { categorizeByRoot } from '@/lib/categoryHierarchy';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const STATUS_LABEL = {
  pending: 'Pendente',
  provisioned: 'Provisionado',
  overdue: 'Vencido',
};

function statusLabel(p) {
  const today = new Date().toISOString().slice(0, 10);
  if (p.status === 'pending' && p.due_date < today) return 'Vencido';
  return STATUS_LABEL[p.status] || p.status;
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
        <div className="text-right shrink-0">
          <div className="text-xs font-bold text-slate-600">{count} itens · {fmt(total)}</div>
        </div>
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

export default function ReconciliationLists({ transactions, payables, categories, selectedMonthStr }) {
  // 3.2 Saiu sem obrigação
  const saiuSemObrigacao = useMemo(() => {
    return transactions.filter(t =>
      t.type === 'expense' &&
      format(new Date(t.date), 'yyyy-MM') === selectedMonthStr &&
      !t.payable_id
    );
  }, [transactions, selectedMonthStr]);

  // IDs de payables já conciliados (têm Transaction apontando pra eles)
  const conciliatedPayableIds = useMemo(() => {
    const ids = new Set();
    transactions.forEach(t => { if (t.payable_id) ids.add(t.payable_id); });
    return ids;
  }, [transactions]);

  // 3.3 Devia mas não saiu
  const deviasMasNaoSaiu = useMemo(() => {
    return payables.filter(p => {
      const ref = p.competencia || p.due_date;
      if (!ref) return false;
      if (format(new Date(ref), 'yyyy-MM') !== selectedMonthStr) return false;
      if (p.status === 'paid' || p.status === 'conciliated') return false;
      if (conciliatedPayableIds.has(p.id)) return false;
      return true;
    });
  }, [payables, selectedMonthStr, conciliatedPayableIds]);

  // 3.4 Limbo
  const limbo = useMemo(() => {
    const payableMap = {};
    payables.forEach(p => { payableMap[p.id] = p; });

    return transactions.filter(t => {
      if (t.type !== 'expense') return false;
      if (format(new Date(t.date), 'yyyy-MM') !== selectedMonthStr) return false;
      if (!t.payable_id) return false;
      const p = payableMap[t.payable_id];
      if (!p) return false;
      const pRef = p.competencia || p.due_date;
      if (!pRef) return false;
      return format(new Date(pRef), 'yyyy-MM') !== selectedMonthStr;
    }).map(t => {
      const p = payableMap[t.payable_id];
      const pRef = p?.competencia || p?.due_date;
      return {
        ...t,
        payable_month: pRef ? format(new Date(pRef), 'MMM/yy', { locale: ptBR }) : '?',
        tx_month: format(new Date(t.date), 'MMM/yy', { locale: ptBR }),
      };
    });
  }, [transactions, payables, selectedMonthStr]);

  const totalSaiu = saiuSemObrigacao.reduce((s, t) => s + (t.amount || 0), 0);
  const totalDevia = deviasMasNaoSaiu.reduce((s, p) => s + (p.amount || 0), 0);
  const totalLimbo = limbo.reduce((s, t) => s + (t.amount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* 3.2 Saiu sem obrigação */}
        <ListCard
          icon={ArrowUpRight}
          iconColor="text-slate-500"
          title="Saiu sem obrigação"
          subtitle="Transações avulsas — sem payable correspondente"
          count={saiuSemObrigacao.length}
          total={totalSaiu}
          items={saiuSemObrigacao}
          renderRow={(t) => {
            const { rootName, rootColor } = categorizeByRoot(t, categories);
            return (
              <div key={t.id} className="px-4 py-2.5 flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: rootColor }} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-700 truncate">{t.description}</div>
                  <div className="text-[10px] text-slate-400">{format(new Date(t.date), 'dd/MM')} · {rootName}</div>
                </div>
                <div className="text-xs font-bold text-slate-800 shrink-0">{fmt(t.amount)}</div>
              </div>
            );
          }}
        />

        {/* 3.3 Devia mas não saiu */}
        <ListCard
          icon={AlertTriangle}
          iconColor="text-amber-500"
          title="Devia mas não saiu"
          subtitle="Payables do mês sem transação registrada"
          count={deviasMasNaoSaiu.length}
          total={totalDevia}
          items={deviasMasNaoSaiu}
          renderRow={(p) => {
            const { rootName, rootColor } = categorizeByRoot(p, categories);
            return (
              <div key={p.id} className="px-4 py-2.5 flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: rootColor }} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-700 truncate">{p.description}</div>
                  <div className="text-[10px] text-slate-400">{p.due_date ? format(new Date(p.due_date), 'dd/MM') : '--'} · {rootName}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-bold text-slate-800">{fmt(p.amount)}</div>
                  <div className="text-[10px] text-amber-600">{statusLabel(p)}</div>
                </div>
              </div>
            );
          }}
        />
      </div>

      {/* 3.4 Limbo */}
      <ListCard
        icon={AlertTriangle}
        iconColor="text-red-500"
        title="Limbo — saiu este mês mas o payable está em outro"
        subtitle="Estas despesas somem da aba Contas a Pagar porque a competência do payable não bate com a data da transação"
        count={limbo.length}
        total={totalLimbo}
        items={limbo}
        renderRow={(t) => {
          const { rootName, rootColor } = categorizeByRoot(t, categories);
          return (
            <div key={t.id} className="px-4 py-2.5 flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: rootColor }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-slate-700 truncate">{t.description}</div>
                <div className="text-[10px] text-slate-400">{format(new Date(t.date), 'dd/MM')} · {rootName}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-bold text-slate-800">{fmt(t.amount)}</div>
                <div className="text-[10px] text-red-500 font-medium">{t.payable_month} → {t.tx_month}</div>
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}