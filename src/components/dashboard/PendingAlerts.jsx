import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, isPast, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import ConfirmReceivableModal from './ConfirmReceivableModal';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function PendingAlerts({ payables, receivables, onRefresh }) {
  const [confirmingReceivable, setConfirmingReceivable] = useState(null);

  const allAlerts = [
    ...payables.filter(p => p.status === 'pending').map(p => ({ ...p, alertType: 'payable' })),
    ...receivables.filter(r => r.status === 'pending').map(r => ({ ...r, alertType: 'receivable' })),
  ].sort((a, b) => new Date(a.due_date) - new Date(b.due_date)).slice(0, 8);

  return (
    <>
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Alertas Pendentes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {allAlerts.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum pendente 🎉</p>
          )}
          {allAlerts.map(item => {
            const overdue = item.due_date && isPast(new Date(item.due_date)) && !isToday(new Date(item.due_date));
            const isReceivable = item.alertType === 'receivable';
            return (
              <div key={item.id} className={`p-3 rounded-lg border text-sm flex items-center justify-between gap-3 ${
                isReceivable
                  ? overdue ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50/40'
                  : overdue ? 'border-red-200 bg-red-50' : 'border-border bg-muted/30'
              }`}>
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
                    <Button
                      size="sm"
                      onClick={() => setConfirmingReceivable(item)}
                      className="h-7 text-xs px-3 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Receber
                    </Button>
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