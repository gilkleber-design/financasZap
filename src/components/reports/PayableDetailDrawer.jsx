import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const CATEGORY_LABELS = {
  alimentacao: 'Alimentação', transporte: 'Transporte', moradia: 'Moradia',
  saude: 'Saúde', educacao: 'Educação', lazer: 'Lazer', vestuario: 'Vestuário',
  servicos: 'Serviços', impostos: 'Impostos', transferencia_liquidacao: 'Transferência',
  outros: 'Outros',
};

const statusConfig = {
  pending: { label: 'Pendente', color: 'bg-amber-100 text-amber-800' },
  paid: { label: 'Pago', color: 'bg-green-100 text-green-800' },
  overdue: { label: 'Vencido', color: 'bg-red-100 text-red-800' },
  scheduled: { label: 'Agendado', color: 'bg-blue-100 text-blue-800' },
  provisioned: { label: 'Provisionado', color: 'bg-slate-100 text-slate-800' },
};

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function PayableDetailDrawer({ open, onOpenChange, payable }) {
  if (!payable) return null;

  const status = statusConfig[payable.status] || statusConfig.pending;
  const category = CATEGORY_LABELS[payable.category] || payable.category;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-md">
        <SheetHeader>
          <SheetTitle className="text-xl">Detalhes do Lançamento</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Descrição */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase">Descrição</label>
            <p className="text-sm font-medium break-words">{payable.description}</p>
          </div>

          {/* Categoria e Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Categoria</label>
              <Badge variant="outline" className="w-fit">{category}</Badge>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Status</label>
              <Badge className={`w-fit ${status.color}`}>{status.label}</Badge>
            </div>
          </div>

          {/* Valores */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-muted/30 rounded-lg">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Valor</label>
              <p className="text-lg font-bold text-foreground mt-1">{fmt(payable.amount)}</p>
            </div>
            {payable.installment_total && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Parcela</label>
                <p className="text-lg font-bold text-foreground mt-1">
                  {payable.installment_number}/{payable.installment_total}
                </p>
              </div>
            )}
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Vencimento</label>
              <p className="text-sm">{format(new Date(payable.due_date), 'dd/MM/yyyy')}</p>
            </div>
            {payable.purchase_date && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase">Data da Compra</label>
                <p className="text-sm">{format(new Date(payable.purchase_date), 'dd/MM/yyyy')}</p>
              </div>
            )}
          </div>

          {/* Origem */}
          {payable.origin_type && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Origem</label>
              <p className="text-sm capitalize">{payable.origin_type === 'account' ? 'Conta Corrente' : 'Cartão de Crédito'}</p>
            </div>
          )}

          {/* Modalidade de Pagamento */}
          {payable.payment_modality && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Modalidade</label>
              <p className="text-sm capitalize">
                {payable.payment_modality === 'manual' ? 'Manual' :
                 payable.payment_modality === 'automatic_debit' ? 'Débito Automático' : 'Fatura do Cartão'}
              </p>
            </div>
          )}

          {/* Competência */}
          {payable.competencia && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Competência</label>
              <p className="text-sm">{format(new Date(payable.competencia), 'MMMM/yyyy', { locale: ptBR })}</p>
            </div>
          )}

          {/* Notas */}
          {payable.notes && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Notas</label>
              <p className="text-sm text-muted-foreground break-words">{payable.notes}</p>
            </div>
          )}

          {/* ID e Metadados */}
          <div className="pt-4 border-t space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase">Metadados</label>
            <div className="space-y-1 text-xs text-muted-foreground font-mono">
              <p>ID: {payable.id}</p>
              <p>Criado: {format(new Date(payable.created_date), 'dd/MM/yyyy HH:mm')}</p>
              {payable.updated_date && <p>Atualizado: {format(new Date(payable.updated_date), 'dd/MM/yyyy HH:mm')}</p>}
              {payable.created_by && <p>Por: {payable.created_by}</p>}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}