import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CategorySelect } from '@/components/ui/category-select';
import { CurrencyInput } from '@/components/ui/currency-input';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Bell, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

export default function EditPayableModal({ payable, onClose, onSaved }) {
  // O split('T')[0] garante que o input date consiga ler a data do banco (YYYY-MM-DD)
  const [form, setForm] = useState({
    description: payable?.description || '',
    amount: payable?.amount || '',
    due_date: payable?.due_date ? payable.due_date.split('T')[0] : '',
    competencia: payable?.competencia ? payable.competencia.split('T')[0] : '',
    category: payable?.category || '',
    notes: payable?.notes || '',
    due_alert_whatsapp: payable?.due_alert_whatsapp === true,
  });
  const [saving, setSaving] = useState(false);
  const [promptScope, setPromptScope] = useState(false);
  const queryClient = useQueryClient();

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const executeSave = async (scope) => {
    setSaving(true);
    setPromptScope(false);

    const competencia = form.competencia || form.due_date;

    try {
      if (scope === 'this') {
        await base44.entities.Payable.update(payable.id, {
          description: form.description,
          amount: parseFloat(form.amount),
          due_date: form.due_date,
          competencia,
          category: form.category,
          notes: form.notes || undefined,
          due_alert_whatsapp: form.due_alert_whatsapp,
        });
      } else if (scope === 'all') {
        const allPayables = await base44.entities.Payable.list('-due_date', 500);
        // If it belongs to an installment group, match by group. If recurrence, match by recurrence_id. Else match by description.
        const toUpdate = allPayables.filter(p => {
          if (payable.installment_group_id && p.installment_group_id === payable.installment_group_id) return true;
          if (payable.recurrence_id && p.recurrence_id === payable.recurrence_id) return true;
          if (!payable.installment_group_id && !payable.recurrence_id && p.description === payable.description) return true;
          return false;
        });
        
        for (const p of toUpdate) {
          await base44.entities.Payable.update(p.id, {
            description: form.description,
            amount: parseFloat(form.amount),
            competencia: form.competencia || p.due_date,
            category: form.category,
            notes: form.notes || undefined,
            due_alert_whatsapp: form.due_alert_whatsapp,
          });
        }
        if (payable.recurrence_id) {
          await base44.entities.Recurrence.update(payable.recurrence_id, {
            description: form.description,
            amount: parseFloat(form.amount),
            category: form.category,
          });
        }
      } else if (scope === 'forward') {
        const allPayables = await base44.entities.Payable.list('-due_date', 500);
        const toUpdate = allPayables.filter(p => {
          let matchesGroup = false;
          if (payable.installment_group_id && p.installment_group_id === payable.installment_group_id) matchesGroup = true;
          else if (payable.recurrence_id && p.recurrence_id === payable.recurrence_id) matchesGroup = true;
          else if (!payable.installment_group_id && !payable.recurrence_id && p.description === payable.description) matchesGroup = true;
          
          return matchesGroup && new Date(p.due_date) >= new Date(payable.due_date);
        });

        for (const p of toUpdate) {
          await base44.entities.Payable.update(p.id, {
            description: form.description,
            amount: parseFloat(form.amount),
            competencia: form.competencia || p.due_date,
            category: form.category,
            notes: form.notes || undefined,
            due_alert_whatsapp: form.due_alert_whatsapp,
          });
        }
        if (payable.recurrence_id) {
          await base44.entities.Recurrence.update(payable.recurrence_id, {
            description: form.description,
            amount: parseFloat(form.amount),
            category: form.category,
          });
        }
      }

      await queryClient.invalidateQueries();
      onSaved();
    } catch (error) {
      toast.error('Erro ao salvar alteração.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRequest = () => {
    if (!form.description || !form.amount || !form.due_date) {
      return toast.error('Preencha todos os campos obrigatórios');
    }

    if (payable.recurrence_id || payable.installment_group_id) {
      setPromptScope(true);
    } else {
      executeSave('this');
    }
  };

  if (promptScope) {
    return (
      <AlertDialog open onOpenChange={() => setPromptScope(false)}>
        <AlertDialogContent className="font-sora">
          <AlertDialogHeader>
            <AlertDialogTitle>Como deseja salvar esta alteração?</AlertDialogTitle>
            <AlertDialogDescription>
              Selecione o escopo da atualização para "{payable.description}":
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 mt-4">
            <Button variant="outline" className="font-bold justify-start" onClick={() => executeSave('this')} disabled={saving}>
              ✅ APENAS NESTE MÊS/PARCELA
            </Button>
            <Button variant="outline" className="font-bold justify-start" onClick={() => executeSave('forward')} disabled={saving}>
              ➡️ NESTE MÊS E NOS FUTUROS
            </Button>
            <Button variant="outline" className="font-bold justify-start" onClick={() => executeSave('all')} disabled={saving}>
              🔄 EM TODAS AS PARCELAS (INCLUI PASSADO)
            </Button>
            <AlertDialogCancel className="mt-2 font-bold" disabled={saving}>CANCELAR</AlertDialogCancel>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <div className="px-6 py-4 border-b shrink-0">
          <DialogHeader>
            <DialogTitle>Editar Conta a Pagar</DialogTitle>
          </DialogHeader>
        </div>
        
        <div className="space-y-4 p-6 overflow-y-auto flex-1 min-w-0">
          <div>
            <Label>Descrição *</Label>
            <Input
              value={form.description}
              onChange={e => set('description', e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor (R$) *</Label>
              <CurrencyInput
                value={form.amount}
                onChange={(value) => set('amount', value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Data de Vencimento *</Label>
              <Input
                type="date"
                value={form.due_date}
                onChange={e => set('due_date', e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label>Categoria</Label>
            <CategorySelect
              value={form.category}
              onChange={(value) => set('category', value)}
              allowedTypes={['expense', 'transfer']}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Competência (opcional)</Label>
            <Input
              type="date"
              value={form.competencia}
              onChange={e => set('competencia', e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">Se não preenchido, usa a data de vencimento</p>
          </div>

          <div className="border border-border rounded-xl p-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 cursor-pointer">
                <Bell className="w-4 h-4 text-primary" /> Alerta de vencimento no WhatsApp
              </Label>
              <button
                type="button"
                onClick={() => set('due_alert_whatsapp', !form.due_alert_whatsapp)}
                className={`inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.due_alert_whatsapp ? 'bg-primary' : 'bg-slate-300'}`}
              >
                <span className={`h-5 w-5 rounded-full bg-white transition-transform ${form.due_alert_whatsapp ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
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
        </div>

        <div className="flex flex-col gap-3 px-6 py-4 border-t shrink-0 bg-slate-50 mt-auto">
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1 font-bold">
              Cancelar
            </Button>
            <Button onClick={handleSaveRequest} disabled={saving} className="flex-1 font-bold">
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}