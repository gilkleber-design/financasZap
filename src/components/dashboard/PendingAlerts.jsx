import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format, isPast, isToday, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import ConfirmReceivableModal from './ConfirmReceivableModal';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function PendingAlerts({ payables, receivables, mode, onRefresh }) {
  const [confirmingReceivable, setConfirmingReceivable] = useState(null);

  // mode='receitas': só contas a receber pendentes
  // mode='despesas': só despesas vencidas ou vencendo em até 7 dias
  const allAlerts = mode === 'receitas'
    ? receivables
        .filter(r => r.status === 'pending')
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
        .slice(0, 10)
        .map(r => ({ ...r, alertType: 'receivable' }))
    : payables
        .filter(p => p.status === 'pending' && p.due_date && new Date(p.due_date) <= addDays(new Date(), 7))
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
        .slice(0, 10)
        .map(p => ({ ...p, alertType: 'payable' }));

  const title = mode === 'receitas' ? 'Contas a Receber' : 'Vencimentos Próximos';

  return (
    <>
      <Card className="border border-white/20 bg-white/10 backdrop-blur-lg shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {allAlerts.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {mode === 'receitas' ? 'Nenhuma conta a receber pendente 🎉' : 'Nenhum vencimento próximo 🎉'}
            </p>
          )}
          {allAlerts.map(item => {
            const overdue = item.due_date && isPast(new Date(item.due_date)) && !isToday(new Date(item.due_date));
            const isReceivable = item.alertType === 'receivable';
            return (
              <div
                key={item.id}
                className={`p-3 rounded-lg border text-sm flex items-center justify-between gap-3 ${
                  overdue ? 'border-red-200 bg-red-50' : 'border-border bg-muted/30'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate text-sm">{item.description}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className={`text-xs ${overdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                      {item.due_date ? format(new Date(item.due_date), 'dd/MM', { locale: ptBR }) : '—'}
                      {overdue && ' · Vencido'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <p className={`font-semibold text-sm ${isReceivable ? 'text-emerald-600' : 'text-red-500'}`}>
                    {isReceivable ? '+' : '-'}{fmt(item.net_amount || item.amount)}
                  </p>
                  {isReceivable && (
                    <button
                      onClick={() => setConfirmingReceivable(item)}
                      className="text-emerald-500 hover:text-emerald-700 transition-colors"
                      title="Marcar como recebido"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {confirmingReceivable && (
        <ConfirmReceivableModal
          receivable={confirmingReceivable}
          onClose={() => {
            setConfirmingReceivable(null);
            onRefresh?.();
          }}
        />
      )}
    </>
  );
}