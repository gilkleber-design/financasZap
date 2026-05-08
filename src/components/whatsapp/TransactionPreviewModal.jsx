import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, Edit2, Save, Link2, X } from 'lucide-react';

const CATEGORIES = [
  { value: 'alimentacao', label: 'Alimentação' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'moradia', label: 'Moradia' },
  { value: 'saude', label: 'Saúde' },
  { value: 'educacao', label: 'Educação' },
  { value: 'lazer', label: 'Lazer' },
  { value: 'vestuario', label: 'Vestuário' },
  { value: 'servicos', label: 'Serviços' },
  { value: 'impostos', label: 'Impostos' },
  { value: 'salario_clt', label: 'Salário CLT' },
  { value: 'receita_pj', label: 'Receita PJ' },
  { value: 'outros', label: 'Outros' },
];

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

function hasSimilarity(a, b) {
  if (!a || !b) return false;
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  const wordsA = normalize(a);
  const wordsB = normalize(b);
  return wordsA.some(w => wordsB.includes(w));
}

export default function TransactionPreviewModal({ data, incomeSources, payables, receivables, cards = [], onSave, onCancel }) {
  const [form, setForm] = useState({ ...data });
  const [paymentMethod, setPaymentMethod] = useState('');
  const [reconcileSuggestion, setReconcileSuggestion] = useState(null);
  const [reconcileDecided, setReconcileDecided] = useState(false);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  // Detecta sugestão de conciliação ao montar ou quando descrição/tipo mudam
  useEffect(() => {
    if (reconcileDecided) return;

    // Se a IA já identificou uma conciliação, usa ela
    if (form.receivable_id) {
      const r = receivables.find(r => r.id === form.receivable_id);
      if (r) { setReconcileSuggestion({ item: r, entityType: 'receivable' }); return; }
    }
    if (form.payable_id) {
      const p = payables.find(p => p.id === form.payable_id);
      if (p) { setReconcileSuggestion({ item: p, entityType: 'payable' }); return; }
    }

    // Busca por similaridade de texto
    if (form.type === 'income') {
      const match = receivables.find(r => r.status === 'pending' && hasSimilarity(form.description, r.description));
      if (match) setReconcileSuggestion({ item: match, entityType: 'receivable' });
    } else {
      const match = payables.find(p => p.status === 'pending' && hasSimilarity(form.description, p.description));
      if (match) setReconcileSuggestion({ item: match, entityType: 'payable' });
    }
  }, [form.description, form.type]);

  const confirmReconcile = () => {
    set('reconciled', true);
    if (reconcileSuggestion.entityType === 'receivable') set('receivable_id', reconcileSuggestion.item.id);
    if (reconcileSuggestion.entityType === 'payable') set('payable_id', reconcileSuggestion.item.id);
    setReconcileDecided(true);
  };

  const rejectReconcile = () => {
    set('reconciled', false);
    set('receivable_id', null);
    set('payable_id', null);
    setReconcileSuggestion(null);
    setReconcileDecided(true);
  };

  const handleSave = () => {
    const finalData = { ...form };
    if (paymentMethod) finalData.notes = `${finalData.notes ? finalData.notes + ' | ' : ''}Pagamento: ${paymentMethod}`;
    onSave(finalData);
  };

  // Monta opções de pagamento
  const paymentOptions = [
    'Dinheiro', 'Pix', 'Transferência',
    ...cards.filter(c => c.active && (c.type === 'credit' || c.type === 'both')).map(c => `Cartão Crédito - ${c.name}`),
    ...cards.filter(c => c.active && (c.type === 'debit' || c.type === 'both')).map(c => `Cartão Débito - ${c.name}`),
    'Boleto', 'Outro',
  ];

  const entityLabel = reconcileSuggestion?.entityType === 'receivable' ? 'conta a receber' : 'conta a pagar';

  return (
    <Card className="border-2 border-primary/20 shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Edit2 className="w-4 h-4 text-primary" />
            Revisar Lançamento
          </CardTitle>
          <Badge variant={form.confidence > 0.7 ? 'default' : 'destructive'} className="text-xs">
            {form.confidence > 0.7 ? '✓ Alta confiança' : '⚠ Verificar'}
          </Badge>
        </div>
        {form.notes && !form.notes.startsWith('Pagamento:') && (
          <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-3 h-3 flex-shrink-0" /> {form.notes}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">

        {/* Alerta de conciliação — DESTAQUE */}
        {reconcileSuggestion && !reconcileDecided && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-amber-600" />
              <p className="text-sm font-semibold text-amber-800">Encontrei uma {entityLabel} com nome similar!</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-amber-200">
              <p className="text-sm font-medium">{reconcileSuggestion.item.description}</p>
              <p className="text-sm font-bold text-emerald-600 mt-0.5">{fmt(reconcileSuggestion.item.net_amount || reconcileSuggestion.item.amount)}</p>
              {reconcileSuggestion.item.due_date && (
                <p className="text-xs text-muted-foreground mt-0.5">Vencimento: {reconcileSuggestion.item.due_date}</p>
              )}
            </div>
            <p className="text-xs text-amber-700">Este lançamento é referente a essa {entityLabel}?</p>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 bg-amber-600 hover:bg-amber-700 text-white" onClick={confirmReconcile}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Sim, conciliar
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={rejectReconcile}>
                <X className="w-3.5 h-3.5 mr-1" /> Não, são diferentes
              </Button>
            </div>
          </div>
        )}

        {/* Conciliação confirmada */}
        {reconcileDecided && (form.payable_id || form.receivable_id) && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-medium text-emerald-700">Conciliação confirmada</p>
              <p className="text-xs text-emerald-600">{reconcileSuggestion?.item?.description}</p>
            </div>
            <Button variant="ghost" size="sm" className="text-xs h-6 text-muted-foreground" onClick={rejectReconcile}>
              Remover
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label className="text-xs">Descrição</Label>
            <Input value={form.description || ''} onChange={e => set('description', e.target.value)} className="mt-1" />
          </div>

          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={form.type} onValueChange={v => { set('type', v); setReconcileDecided(false); setReconcileSuggestion(null); }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="income">Receita</SelectItem>
                <SelectItem value="expense">Despesa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Categoria</Label>
            <Select value={form.category} onValueChange={v => set('category', v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Valor Bruto (R$)</Label>
            <Input type="number" value={form.amount || ''} onChange={e => set('amount', parseFloat(e.target.value))} className="mt-1" />
          </div>

          <div>
            <Label className="text-xs">Data</Label>
            <Input type="date" value={form.date || ''} onChange={e => set('date', e.target.value)} className="mt-1" />
          </div>

          {form.type === 'income' && (
            <>
              <div>
                <Label className="text-xs">Alíquota Imposto (%)</Label>
                <Input type="number" value={form.tax_rate || ''} onChange={e => {
                  const rate = parseFloat(e.target.value) || 0;
                  set('tax_rate', rate);
                  set('tax_amount', (form.amount || 0) * rate / 100);
                  set('net_amount', (form.amount || 0) * (1 - rate / 100));
                }} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Valor Líquido (R$)</Label>
                <Input type="number" value={form.net_amount || form.amount || ''} onChange={e => set('net_amount', parseFloat(e.target.value))} className="mt-1" />
              </div>
            </>
          )}
        </div>

        {/* Forma de pagamento */}
        <div>
          <Label className="text-xs">Forma de Pagamento *</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Selecione como foi pago/recebido..." />
            </SelectTrigger>
            <SelectContent>
              {paymentOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Tax summary */}
        {form.type === 'income' && form.tax_amount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs space-y-1">
            <p className="font-medium text-amber-700">📊 Resumo Fiscal</p>
            <p className="text-amber-600">Bruto: {fmt(form.amount)} · Imposto ({form.tax_rate}%): {fmt(form.tax_amount)} · Líquido: {fmt(form.net_amount)}</p>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} className="flex-1">Cancelar</Button>
        <Button onClick={handleSave} disabled={!paymentMethod} className="flex-1">
          <Save className="w-4 h-4 mr-2" />
          Salvar Lançamento
        </Button>
      </CardFooter>
    </Card>
  );
}