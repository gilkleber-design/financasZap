import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const CATEGORIES = [
  { value: 'moradia', label: 'Moradia' },
  { value: 'servicos', label: 'Serviços' },
  { value: 'alimentacao', label: 'Alimentação' },
  { value: 'saude', label: 'Saúde' },
  { value: 'educacao', label: 'Educação' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'lazer', label: 'Lazer' },
  { value: 'impostos', label: 'Impostos' },
  { value: 'outros', label: 'Outros' },
];

export default function RecurrenceFormModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    description: '',
    amount: '',
    due_day: '',
    category: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.description || !form.amount || !form.due_day || !form.category) {
      return toast.error('Preencha todos os campos obrigatórios');
    }
    const day = parseInt(form.due_day);
    if (day < 1 || day > 31) return toast.error('Dia de vencimento inválido (1-31)');

    setSaving(true);
    const recurrence = await base44.entities.Recurrence.create({
      description: form.description,
      amount: parseFloat(form.amount),
      due_day: day,
      category: form.category,
      notes: form.notes || undefined,
      active: true,
    });
    setSaving(false);
    onSaved(recurrence);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Despesa Recorrente</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Descrição *</Label>
            <Input
              value={form.description}
              onChange={e => set('description', e.target.value)}
              className="mt-1"
              placeholder="Ex: Aluguel, Netflix, Condomínio"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor Mensal (R$) *</Label>
              <Input
                type="number"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
                className="mt-1"
                placeholder="0,00"
              />
            </div>
            <div>
              <Label>Dia do Vencimento *</Label>
              <Input
                type="number"
                value={form.due_day}
                onChange={e => set('due_day', e.target.value)}
                className="mt-1"
                placeholder="Ex: 5, 10, 15"
                min={1}
                max={31}
              />
            </div>
          </div>
          <div>
            <Label>Categoria *</Label>
            <Select value={form.category} onValueChange={v => set('category', v)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecionar categoria" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Observações</Label>
            <Input
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              className="mt-1"
              placeholder="Opcional"
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
            Ao salvar, serão gerados automaticamente <strong>12 lançamentos futuros</strong> em Contas a Pagar com status <strong>Pendente</strong>.
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? 'Salvando...' : 'Criar e Gerar Lançamentos'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}