import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { CategorySelect } from '@/components/ui/category-select';
import { CurrencyInput } from '@/components/ui/currency-input';
import { toast } from 'sonner';
import { useCategories } from '@/hooks/useCategories';
import { usePaymentOrigins } from '@/hooks/usePaymentOrigins';
import { addMonths, format } from 'date-fns';
import { CreditCard, Landmark, Layers } from 'lucide-react';

const genId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const FALLBACK_CATEGORIES = [
  { value: 'alimentacao', label: 'Alimentação' }, { value: 'transporte', label: 'Transporte' },
  { value: 'moradia', label: 'Moradia' }, { value: 'saude', label: 'Saúde' },
  { value: 'educacao', label: 'Educação' }, { value: 'lazer', label: 'Lazer' },
  { value: 'vestuario', label: 'Vestuário' }, { value: 'servicos', label: 'Serviços' },
  { value: 'impostos', label: 'Impostos' }, { value: 'outros', label: 'Outros' },
];

export default function PayableFormModal({ onClose, onSaved }) {
  const today = format(new Date(), 'yyyy-MM-dd');
  
  const [form, setForm] = useState({
    description: '', amount: '', due_date: today, competencia: today,
    category: '', category_id: '', recurrent: false, notes: '',
    origin_id: '', origin_type: '',
    payment_modality: 'manual',
    is_installment: false,
    installment_total_amount: '',
    installment_count: '',
    installment_number: '1',
  });

  const [saving, setSaving] = useState(false);
  const { flatForSelect, categories: allCategories } = useCategories();
  const { origins } = usePaymentOrigins();
  
  // Garante que usamos as categorias do banco preferencialmente
  const categories = flatForSelect.filter(category => ['expense', 'transfer'].includes(category.type || 'expense'));
  const getCategoryBySlug = (slug) => allCategories.find(category => category.slug === slug);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleOriginChange = (value) => {
    if (value === '_none') {
        set('origin_id', '');
        set('origin_type', '');
        return;
    }
    const origin = origins.find(o => o.id === value);
    if (!origin) return;
    set('origin_id', origin.id);
    set('origin_type', origin.type);
    if (origin.type === 'card') {
      set('payment_modality', 'card_invoice');
    } else if (form.payment_modality === 'card_invoice') {
      set('payment_modality', 'manual');
    }
  };

  const handleSave = async () => {
    if (!form.description || !form.amount || !form.due_date) {
      return toast.error('Preencha os campos obrigatórios');
    }

    setSaving(true);
    const amountFloat = parseFloat(form.amount);

    try {
        if (form.is_installment) {
          const total = parseFloat(form.installment_total_amount || form.amount);
          const count = parseInt(form.installment_count) || 1;
          const startNumber = parseInt(form.installment_number) || 1;
          const installmentAmount = total / count;
          const groupId = genId();
          const baseDate = new Date(form.due_date + 'T12:00:00');

          const payables = [];
          for (let i = 0; i < (count - startNumber + 1); i++) {
            const dueDate = addMonths(baseDate, i);
            const dueDateStr = format(dueDate, 'yyyy-MM-dd');
            payables.push({
              description: `${form.description} (${startNumber + i}/${count})`,
              amount: Math.round(installmentAmount * 100) / 100,
              due_date: dueDateStr + 'T12:00:00',
              competencia: dueDateStr,
              category_id: form.category_id || undefined,
              category: !form.category_id ? (form.category || 'outros') : undefined,
              status: 'pending',
              recurrent: false,
              origin_id: form.origin_id || undefined,
              origin_type: form.origin_type || undefined,
              payment_modality: form.payment_modality,
              installment_total_amount: total,
              installment_count: count,
              installment_number: startNumber + i,
              installment_group_id: groupId,
              notes: form.notes || undefined,
            });
          }
          await base44.entities.Payable.bulkCreate(payables);
          toast.success(`${payables.length} parcelas criadas!`);
        } else {
           const isAutoDebit = form.payment_modality === 'automatic_debit';
           await base44.entities.Payable.create({
             description: form.description,
             amount: amountFloat,
             due_date: form.due_date + 'T12:00:00',
             competencia: form.competencia || form.due_date,
             category_id: form.category_id || undefined,
             category: !form.category_id ? (form.category || 'outros') : undefined,
             status: isAutoDebit ? 'scheduled' : 'pending',
             recurrent: form.recurrent,
             origin_id: form.origin_id || undefined,
             origin_type: form.origin_type || undefined,
             payment_modality: form.payment_modality,
             notes: form.notes || undefined,
           });
           toast.success('Lançamento criado com sucesso!');
         }
         onSaved();
    } catch (error) {
        console.error(error);
        toast.error('Erro ao salvar lançamento');
    } finally {
        setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nova Conta a Pagar</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">

          <div>
            <Label>Descrição *</Label>
            <Input value={form.description} onChange={e => set('description', e.target.value)} className="mt-1" placeholder="Ex: Aluguel, Netflix..." />
          </div>

          <div>
            <Label>Origem do Pagamento</Label>
            <Select value={form.origin_id || "_none"} onValueChange={handleOriginChange}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar conta ou cartão..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Nenhuma —</SelectItem>
                {origins.map(o => (
                  <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor (R$) *</Label>
              <CurrencyInput value={form.amount} onChange={(value) => set('amount', value)} className="mt-1" />
            </div>
            <div>
              <Label>Vencimento *</Label>
              <Input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} className="mt-1" />
            </div>
          </div>

          <div>
            <Label>Categoria</Label>
            <CategorySelect
              value={form.category}
              onChange={(value) => {
                const category = getCategoryBySlug(value);
                set('category', value);
                set('category_id', category?.id || '');
              }}
              allowedTypes={['expense', 'transfer']}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Competência (opcional)</Label>
            <Input type="date" value={form.competencia} onChange={e => set('competencia', e.target.value)} className="mt-1" />
          </div>

          <div className="border border-border rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 cursor-pointer">
                <Layers className="w-4 h-4 text-primary" /> Compra Parcelada
              </Label>
              <Switch checked={form.is_installment} onCheckedChange={v => set('is_installment', v)} />
            </div>
            {form.is_installment && (
              <div className="grid grid-cols-3 gap-2 pt-1">
                <Input type="number" value={form.installment_total_amount} onChange={e => set('installment_total_amount', e.target.value)} placeholder="Total" />
                <Input type="number" min={1} value={form.installment_count} onChange={e => set('installment_count', e.target.value)} placeholder="Parcelas" />
                <Input type="number" min={1} value={form.installment_number} onChange={e => set('installment_number', e.target.value)} placeholder="Atual" />
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? 'Salvando...' : 'Confirmar Lançamento'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}