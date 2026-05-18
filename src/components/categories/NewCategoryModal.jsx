import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCategories } from '@/hooks/useCategories';
import { toast } from 'sonner';

const COLORS = ['#6366f1', '#22c55e', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6'];

const makeSlug = (name) => name.toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

export default function NewCategoryModal({ onClose, onSaved, defaultType = 'expense' }) {
  const queryClient = useQueryClient();
  const { roots } = useCategories();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', type: defaultType, color: COLORS[0], parent_id: '' });

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.name || !form.slug || !form.type) return toast.error('Nome, identificador e tipo são obrigatórios');

    setSaving(true);
    const category = await base44.entities.Category.create({
      name: form.name,
      slug: form.slug,
      type: form.type,
      color: form.color,
      parent_id: form.parent_id || null,
      active: true,
    });
    await queryClient.invalidateQueries({ queryKey: ['categories'] });
    setSaving(false);
    toast.success('Categoria criada');
    onSaved(category);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nova Categoria</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Nome *</Label>
            <Input
              value={form.name}
              onChange={e => {
                const name = e.target.value;
                setForm(prev => ({ ...prev, name, slug: makeSlug(name) }));
              }}
              className="mt-1"
              placeholder="Ex: Streaming"
            />
          </div>
          <div>
            <Label>Identificador</Label>
            <Input value={form.slug} onChange={e => set('slug', makeSlug(e.target.value))} className="mt-1 font-mono text-xs" />
          </div>
          <div>
            <Label>Tipo *</Label>
            <Select value={form.type} onValueChange={v => set('type', v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Despesa</SelectItem>
                <SelectItem value="income">Receita</SelectItem>
                <SelectItem value="transfer">Transferência</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Categoria pai</Label>
            <Select value={form.parent_id || '_root'} onValueChange={v => set('parent_id', v === '_root' ? '' : v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_root">— Categoria raiz —</SelectItem>
                {roots.filter(root => (root.type || 'expense') === form.type).map(root => <SelectItem key={root.id} value={root.id}>{root.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Cor</Label>
            <div className="flex gap-2 mt-2 flex-wrap">
              {COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => set('color', color)}
                  className={`w-7 h-7 rounded-full transition-all ${form.color === color ? 'ring-2 ring-offset-2 ring-foreground scale-110' : ''}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">{saving ? 'Salvando...' : 'Salvar'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}