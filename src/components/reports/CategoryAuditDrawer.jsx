import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const STATUS_LABEL = { paid: 'Pago', conciliated: 'Conciliado', pending: 'Pendente', provisioned: 'Provisionado' };
const STATUS_COLOR = {
  paid: 'text-emerald-600', conciliated: 'text-emerald-600',
  pending: 'text-slate-500', provisioned: 'text-blue-600',
};

function safeDate(d) {
  try { return format(new Date(d), 'dd/MM/yy'); } catch { return '--'; }
}

export default function CategoryAuditDrawer({ open, onClose, categoryName, total, items = [] }) {
  const navigate = useNavigate();

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center justify-between">
            <span className="truncate">{categoryName || 'Categoria'}</span>
            <span className="text-base font-bold text-slate-800 ml-4 shrink-0">{fmt(total)}</span>
          </SheetTitle>
          <p className="text-xs text-slate-400">{items.length} {items.length === 1 ? 'item' : 'itens'}</p>
        </SheetHeader>

        <div className="divide-y divide-slate-100">
          {items.map((item) => {
            const date = item.date || item.dueDate || item.due_date || item.competencia;
            const isPayable = item.source === 'payable_card' || item.status === 'paid' || item.status === 'pending' || item.status === 'provisioned';
            const navPath = item.source === 'payable_card' || (item.status && !item.type)
              ? `/contas-pagar?id=${item.id}`
              : `/transacoes?id=${item.id}`;

            return (
              <div key={item.id} className="py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-700 truncate">{item.description}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-slate-400">{date ? safeDate(date) : '--'}</span>
                    {item.source === 'payable_card' && (
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold">cartão</span>
                    )}
                    {item.jaContadoEmAtividade && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">já contado</span>
                    )}
                    {item.status && (
                      <span className={`text-[11px] ${STATUS_COLOR[item.status] || 'text-slate-400'}`}>
                        {STATUS_LABEL[item.status] || item.status}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-sm font-bold text-slate-800 shrink-0">{fmt(item.amount || item._amount)}</div>
                <button
                  onClick={() => { onClose(); navigate(navPath); }}
                  className="text-slate-400 hover:text-primary shrink-0 mt-0.5"
                  title="Ir para o registro"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
          {items.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-400">Nenhum item</div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}