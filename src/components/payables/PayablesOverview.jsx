import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, CreditCard, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { formatCurrency, normalizeCategoryLabel } from '@/components/dashboard/financaszapTheme';

const STATUS_PILL = {
  paid: 'bg-[#E6F9F0] border-[#0A9E6A] text-[#0A6E50]',
  overdue: 'bg-[#FFECEC] border-[#E74C3C] text-[#C0392B]',
  pending: 'bg-[#E0F5F5] border-[#0FA3A3] text-[#0A7070]',
  auto: 'bg-[#F0F4F8] border-[#C8D6E0] text-[#7B92A8]',
  provisioned: 'bg-[#EEF2FF] border-[#7C93FF] text-[#4254C5]',
};

export default function PayablesOverview({
  monthLabel,
  kpis,
  sections,
  paidOpen,
  onTogglePaid,
  onOpenNew,
  onOpenManageRecurring,
  onOpenPay,
  atrasadas = [],
  totalAtrasadas = 0,
  atrasadasOpen = false,
  onToggleAtrasadas,
  parseItemDate,
}) {
  const headerColor = {
    overdue: 'text-[#C0392B]',
    soon: 'text-[#D97706]',
    week: 'text-[#0A7070]',
    month: 'text-[#0A7070]',
    auto: 'text-[#7B92A8]',
    paid: 'text-[#0A6E50]',
    reembolso: 'text-slate-500',
  };

  const badgeCls = {
    overdue: 'bg-[#FFD4D4] text-[#C0392B]',
    soon: 'bg-[#FDE68A] text-[#D97706]',
    week: 'bg-[#B8E8E8] text-[#0A7070]',
    month: 'bg-[#B8E8E8] text-[#0A7070]',
    auto: 'bg-[#E2E8F0] text-[#7B92A8]',
    paid: 'bg-[#CCF3E3] text-[#0A6E50]',
    reembolso: 'bg-slate-200 text-slate-500',
  };

  const bgHeader = {
    overdue: 'bg-[#FFF5F5]',
    soon: 'bg-[#FFFBEB]',
    week: 'bg-[#F0FAFA]',
    month: 'bg-[#F0FAFA]',
    auto: 'bg-[#F8FAFC]',
    paid: 'bg-[#F0FBF7]',
    reembolso: 'bg-slate-100',
  };

  const valueColor = {
    overdue: 'text-[#C0392B]',
    soon: 'text-[#D97706]',
    week: 'text-[#0D3B66]',
    month: 'text-[#0D3B66]',
    auto: 'text-[#0D3B66]',
    paid: 'text-[#0A6E50]',
    reembolso: 'text-slate-500',
  };

  const pct = kpis.expected > 0
    ? ((kpis.paid / kpis.expected) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="space-y-3">
      {/* KPIs — ordem: PREVISTO | PAGO | VENCIDO | A VENCER */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Previsto"
          value={formatCurrency(kpis.expected, 2)}
          sub="total do mês"
        />
        <KpiCard
          label="Pago"
          value={formatCurrency(kpis.paid, 2)}
          sub={`${pct}% do previsto`}
        />
        <KpiCard
          label="Vencido"
          value={formatCurrency(kpis.overdue, 2)}
          sub={kpis.overdue > 0 ? 'ação urgente' : 'sem atrasos'}
          valueClassName={kpis.overdue > 0 ? 'text-[#C0392B]' : 'text-[#0A6E50]'}
        />
        <KpiCard
          label="A vencer"
          value={formatCurrency(kpis.open, 2)}
          sub="aguardando prazo"
        />
      </div>

      {/* Banner de atrasos de meses anteriores — entre KPIs e seções do mês */}
      {atrasadas.length > 0 && (
        <div className="rounded-[10px] border border-[#FFCDD2] bg-[#FFF5F5] overflow-hidden">
          <div
            className="px-5 py-3 flex justify-between items-center cursor-pointer select-none"
            onClick={onToggleAtrasadas}
          >
            <span className="text-sm text-[#C0392B] font-medium">
              ⚠ {atrasadas.length} conta(s) em atraso de meses anteriores
            </span>
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-[#C0392B]">
                {formatCurrency(totalAtrasadas, 2)}
              </span>
              <span className="text-base font-bold text-[#C0392B] leading-none">
                {atrasadasOpen ? '−' : '+'}
              </span>
            </div>
          </div>

          {atrasadasOpen && (
            <div className="border-t border-[#FFCDD2] divide-y divide-[#FFE0E0]">
              {atrasadas.map(p => {
                const dueDate = parseItemDate ? parseItemDate(p.due_date || p.competencia) : null;
                return (
                  <div key={p.id} className="flex items-center justify-between px-5 py-3 bg-[#FFF8F8]">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm font-semibold text-[#C0392B] truncate">
                        {p.description}
                      </span>
                      <span className="text-xs text-[#E07070]">
                        Venc: {dueDate ? format(dueDate, 'dd/MM/yyyy') : '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                      <span className="text-sm font-bold text-[#C0392B]">
                        {formatCurrency(Number(p.amount || 0), 2)}
                      </span>
                      <Button
                        size="sm"
                        onClick={() => onOpenPay(p)}
                        className="font-bold bg-[#C0392B] hover:bg-[#A93226] text-white"
                      >
                        Pagar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {sections.map((section) => {
        const total = section.items.reduce((s, r) => s + Number(r.amount || 0), 0);
        return (
          <div
            key={section.key}
            className={`rounded-[14px] border border-border bg-card shadow-sm overflow-hidden ${section.key === 'reembolso' ? 'opacity-60 grayscale-[0.2]' : ''}`}
          >
            <div
              onClick={section.collapsible ? onTogglePaid : undefined}
              className={`flex items-center justify-between px-5 py-3 border-b border-border ${bgHeader[section.key]} ${section.collapsible ? 'cursor-pointer select-none' : ''}`}
            >
              <div className="flex items-center gap-2">
                <span className={`flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.06em] ${headerColor[section.key]}`}>
                  <section.icon className="h-4 w-4" /> {section.title}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${badgeCls[section.key]}`}>
                  {section.items.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[#0D3B66]">{formatCurrency(total, 2)}</span>
                {section.collapsible && (
                  <span className="text-xs text-muted-foreground">{paidOpen ? '−' : '+'}</span>
                )}
              </div>
            </div>

            {(!section.collapsible || paidOpen) && (
              <div className="divide-y divide-[#F0F4F8]">
                {section.items.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between px-5 py-3 hover:bg-[#F8FAFC] transition-colors ${item.autoDebit ? 'opacity-65 hover:opacity-100' : ''}`}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[#0D3B66] truncate">
                          {item.description.replace(/\s*\(\d+\/\d+\)\s*$/, '')}
                        </span>
                        {item.installmentLabel && (
                          <span className="rounded border border-[#C8D6E0] bg-[#F0F4F8] px-1.5 py-0.5 text-[9px] font-bold text-[#7B92A8]">
                            {item.installmentLabel}
                          </span>
                        )}
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${STATUS_PILL[item.pill] || STATUS_PILL.pending}`}>
                          {item.pillLabel}
                        </span>
                      </div>
                      <span className="text-xs text-[#4A6278]">
                        Venc: {item.dueDateLabel} · {normalizeCategoryLabel(item.category)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 ml-4 flex-shrink-0">
                      <span className={`text-sm font-bold ${valueColor[section.key]}`}>
                        {formatCurrency(item.amount, 2)}
                      </span>
                      {item.canPay && (
                        <Button
                          size="sm"
                          onClick={() => onOpenPay(item.original)}
                          className="font-bold bg-primary hover:bg-primary/90 text-white"
                        >
                          Pagar
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function KpiCard({ label, value, sub, valueClassName = 'text-foreground' }) {
  return (
    <div className="rounded-xl border border-[#E8EDF2] bg-white px-4 py-3">
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.05em] text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold ${valueClassName}`}>{value}</div>
      <div className="mt-1 text-[9px] text-muted-foreground">{sub}</div>
    </div>
  );
}

export const PAYABLE_SECTION_ICONS = {
  overdue: AlertTriangle,
  soon: Clock3,
  week: CalendarClock,
  month: CalendarClock,
  auto: CreditCard,
  paid: CheckCircle2,
  reembolso: RefreshCcw,
};