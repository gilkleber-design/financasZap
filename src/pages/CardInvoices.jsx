import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CreditCard, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Clock, RefreshCw, Pencil, Upload, Undo2, ChevronDown, ChevronUp, ListFilter } from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { format, startOfMonth, addMonths, subMonths, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import ConfirmPayableModal from '@/components/payables/ConfirmPayableModal';
import EditInvoiceItemsModal from '@/components/cardInvoices/EditInvoiceItemsModal';
import ImportInvoicePDFModal from '@/components/cardInvoices/ImportInvoicePDFModal';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const STATUS_CONFIG = {
  open:    { label: 'Aberta',   color: 'bg-blue-100 text-blue-700',       icon: Clock },
  closed:  { label: 'Fechada',  color: 'bg-amber-100 text-amber-700',     icon: AlertCircle },
  paid:    { label: 'Paga',     color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  overdue: { label: 'Vencida',  color: 'bg-red-100 text-red-700',         icon: AlertCircle },
};

const STATUS_ITEM_COLORS = {
  provisioned: 'bg-blue-100 text-blue-700',
  paid:        'bg-emerald-100 text-emerald-700',
  pending:     'bg-amber-100 text-amber-700',
};

export default function CardInvoices() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [payingPayable, setPayingPayable] = useState(null);
  const [editingInvoiceItems, setEditingInvoiceItems] = useState(null);
  const [importingCard, setImportingCard] = useState(null);
  const [reopeningInvoice, setReopeningInvoice] = useState(null);
  const [openItems, setOpenItems] = useState({}); // Controle de colapso por cartão
  const queryClient = useQueryClient();

  const toggleItems = (cardId) => setOpenItems(p => ({ ...p, [cardId]: !p[cardId] }));

  const { data: cards = [] } = useQuery({ queryKey: ['cards'], queryFn: () => base44.entities.Card.list() });
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => base44.entities.Account.list() });
  const { data: invoices = [] } = useQuery({ queryKey: ['card_invoices'], queryFn: () => base44.entities.CardInvoice.list('-month', 200) });
  const { data: payables = [] } = useQuery({ queryKey: ['payables'], queryFn: () => base44.entities.Payable.list('-due_date', 500) });

  const creditCards = cards.filter(c => c.type === 'credit' || c.type === 'both');
  const mStart = startOfMonth(currentMonth);
  const refMonthStr = format(mStart, 'yyyy-MM');

  const getCardItems = (cardId) => {
    const card = creditCards.find(c => c.id === cardId);
    const closingDay = card?.closing_day || 1;
    const [refYear, refMon] = refMonthStr.split('-').map(Number);
    const currentClosing = new Date(refYear, refMon - 1, closingDay);
    const prevClosing = new Date(refYear, refMon - 2, closingDay);

    return payables.filter(p => {
      if (p.origin_id !== cardId || p.origin_type !== 'card') return false;
      if (p.is_card_invoice_payable) return false;
      if (p.status === 'provisioned') {
        const comp = p.competencia || p.due_date;
        return comp && comp.startsWith(refMonthStr);
      }
      if ((p.status === 'pending' || p.status === 'scheduled') && p.payment_modality === 'card_invoice') {
        const dueDateStr = (p.due_date || '').replace('T12:00:00', '').slice(0, 10);
        if (!dueDateStr) return false;
        const dueDate = new Date(dueDateStr + 'T12:00:00');
        return dueDate > prevClosing && dueDate <= currentClosing;
      }
      return false;
    });
  };

  const getInvoicePayable = (cardId) => payables.find(p => p.origin_id === cardId && p.is_card_invoice_payable === true && (p.competencia || p.due_date || '').startsWith(refMonthStr));
  const getInvoice = (cardId) => invoices.find(inv => inv.card_id === cardId && inv.month && inv.month.startsWith(refMonthStr));

  const generateMutation = useMutation({
    mutationFn: async (cardId) => {
      const result = await base44.functions.invoke('generateCardInvoices', { forceCardId: cardId, forceMonth: format(mStart, 'yyyy-MM') + '-01' });
      return result.data;
    },
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Fatura fechada!'); },
    onError: () => toast.error('Erro ao gerar fatura'),
  });

  const reopenInvoiceMutation = useMutation({
    mutationFn: async ({ invoice, invoicePayable }) => {
      if (invoicePayable?.id) await base44.entities.Payable.delete(invoicePayable.id);
      if (invoice?.id) await base44.entities.CardInvoice.delete(invoice.id);
      if (invoice?.id) {
        const items = await base44.entities.Payable.filter({ card_invoice_id: invoice.id }, '-due_date', 500);
        await Promise.all(items.map(item => base44.entities.Payable.update(item.id, { card_invoice_id: null, status: item.status === 'paid' ? 'provisioned' : item.status })));
      }
    },
    onSuccess: () => { queryClient.invalidateQueries(); setReopeningInvoice(null); toast.success('Fatura reaberta!'); },
  });

  return (
    <div className="p-6 space-y-6 pb-24">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Faturas de Cartão</h1>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="font-semibold min-w-[120px] text-center capitalize">{format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="grid gap-4">
        {creditCards.map(card => {
          const items = getCardItems(card.id);
          const total = items.reduce((s, p) => s + (p.amount || 0), 0);
          const existingInvoice = getInvoice(card.id);
          const invoicePayable = getInvoicePayable(card.id);
          const invoiceStatus = existingInvoice?.status || (invoicePayable?.status === 'paid' ? 'paid' : null);
          const StatusIcon = invoiceStatus ? (STATUS_CONFIG[invoiceStatus]?.icon || Clock) : null;
          const isExpanded = openItems[card.id];

          return (
            <Card key={card.id} className="border-0 shadow-md overflow-hidden transition-all duration-200">
              <CardHeader className="bg-slate-50/50 pb-4 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-2 rounded-lg"><CreditCard className="w-5 h-5 text-primary" /></div>
                    <div>
                      <CardTitle className="text-lg">{card.name}</CardTitle>
                      <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{card.bank || 'Banco não informado'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-red-600 text-lg leading-none">{fmt(total)}</p>
                    {invoiceStatus && (
                      <Badge className={`mt-1 text-[10px] uppercase font-bold border-0 ${STATUS_CONFIG[invoiceStatus]?.color}`}>
                        {STATUS_CONFIG[invoiceStatus]?.label}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="p-0">
                <Collapsible open={isExpanded} onOpenChange={() => toggleItems(card.id)}>
                  <div className="px-4 py-3 flex items-center justify-between bg-white">
                    <div className="flex gap-4 text-xs text-muted-foreground font-medium">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Fecha: {card.closing_day || '--'}</span>
                      <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Vence: {card.due_day || '--'}</span>
                      <span className="flex items-center gap-1"><ListFilter className="w-3 h-3" /> {items.length} itens</span>
                    </div>
                    
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 text-primary font-bold hover:bg-primary/5">
                        {isExpanded ? <><ChevronUp className="w-4 h-4 mr-1" /> Ocultar Detalhes</> : <><ChevronDown className="w-4 h-4 mr-1" /> Ver Lançamentos</>}
                      </Button>
                    </CollapsibleTrigger>
                  </div>

                  <CollapsibleContent className="border-t bg-slate-50/30">
                    <div className="p-4 space-y-2">
                      {items.length > 0 ? (
                        <div className="bg-white rounded-xl border shadow-sm divide-y">
                          {items.map(p => (
                            <div key={p.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{p.description}</p>
                                <p className="text-[10px] text-muted-foreground font-semibold uppercase">
                                  {format(new Date((p.purchase_date || p.due_date).includes('T') ? (p.purchase_date || p.due_date) : (p.purchase_date || p.due_date) + 'T12:00:00'), 'dd MMM', { locale: ptBR })}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-bold text-slate-800">{fmt(p.amount)}</p>
                                {p.category && <span className="text-[9px] font-bold text-muted-foreground uppercase">{p.category}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-6 border-2 border-dashed rounded-xl bg-muted/10">
                          <p className="text-sm text-muted-foreground">Nenhum lançamento provisionado.</p>
                        </div>
                      )}
                      
                      {/* Resumo da Fatura Consolidada se existir */}
                      {invoicePayable && (
                        <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 mt-4 flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-bold uppercase text-primary/60">Fatura Consolidada</p>
                            <p className="text-sm font-bold">{invoicePayable.description}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-black text-primary">{fmt(invoicePayable.amount)}</p>
                            {invoicePayable.status === 'paid' && <Badge className="bg-emerald-500 hover:bg-emerald-500 text-[10px] uppercase font-bold">Totalmente Paga</Badge>}
                          </div>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Barra de Ações (Sempre visível no card) */}
                <div className="p-4 bg-white border-t flex gap-2 overflow-x-auto no-scrollbar">
                  <Button variant="outline" size="sm" className="text-xs h-9" onClick={() => setImportingCard({ card, refMonth: refMonthStr })}>
                    <Upload className="w-3.5 h-3.5 mr-1.5" /> Importar PDF
                  </Button>
                  
                  {items.length > 0 && (
                    <Button variant="outline" size="sm" className="text-xs h-9" onClick={() => setEditingInvoiceItems(items)}>
                      <Pencil className="w-3.5 h-3.5 mr-1.5" /> Editar Itens
                    </Button>
                  )}

                  {!invoicePayable && items.length > 0 && (
                    <Button className="text-xs h-9 bg-primary hover:bg-primary/90 flex-1 min-w-[120px]" onClick={() => generateMutation.mutate(card.id)} disabled={generateMutation.isPending}>
                      <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${generateMutation.isPending ? 'animate-spin' : ''}`} /> Fechar Fatura
                    </Button>
                  )}

                  {invoicePayable && invoicePayable.status !== 'paid' && (
                    <>
                      <Button className="text-xs h-9 flex-1 bg-emerald-600 hover:bg-emerald-700 text-white min-w-[140px]" onClick={() => setPayingPayable(invoicePayable)}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Pagar {fmt(invoicePayable.amount)}
                      </Button>
                      <Button variant="outline" size="sm" className="text-xs h-9 text-amber-600 border-amber-300 hover:bg-amber-50" onClick={() => setReopeningInvoice({ invoice: existingInvoice, invoicePayable })}>
                        <Undo2 className="w-3.5 h-3.5 mr-1.5" /> Reabrir
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Modais */}
      {payingPayable && <ConfirmPayableModal payable={payingPayable} onClose={() => { setPayingPayable(null); queryClient.invalidateQueries(); }} />}
      {editingInvoiceItems && <EditInvoiceItemsModal items={editingInvoiceItems} onClose={() => setEditingInvoiceItems(null)} onSaved={() => queryClient.invalidateQueries()} />}
      {importingCard && <ImportInvoicePDFModal card={importingCard.card} refMonth={importingCard.refMonth} onClose={() => setImportingCard(null)} onImported={() => { queryClient.invalidateQueries(); setImportingCard(null); }} />}

      {reopeningInvoice && (
        <AlertDialog open onOpenChange={() => setReopeningInvoice(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reabrir fatura?</AlertDialogTitle>
              <AlertDialogDescription>A fatura consolidada será removida e os itens voltarão para "provisionado".</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex gap-2">
              <AlertDialogCancel className="flex-1">Cancelar</AlertDialogCancel>
              <Button variant="destructive" className="flex-1" onClick={() => reopenInvoiceMutation.mutate(reopeningInvoice)} disabled={reopenInvoiceMutation.isPending}>
                {reopenInvoiceMutation.isPending ? 'Reabrindo...' : 'Reabrir Fatura'}
              </Button>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}