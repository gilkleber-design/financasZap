import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CategorySelect, CATEGORY_COLORS } from '@/components/ui/category-select';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

export default function CategoryRuleManager() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ keyword: '', category: '', description: '', priority: 0 });

  const { data: rules = [] } = useQuery({
    queryKey: ['category_rules'],
    queryFn: () => base44.entities.CategoryRule.list('-priority', 200),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.CategoryRule.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['category_rules'] });
      setShowForm(false);
      setForm({ keyword: '', category: '', description: '', priority: 0 });
      toast.success('Regra criada!');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.CategoryRule.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['category_rules'] });
      setEditingId(null);
      setForm({ keyword: '', category: '', description: '', priority: 0 });
      toast.success('Regra atualizada!');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CategoryRule.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['category_rules'] });
      toast.success('Regra removida');
    },
  });

  const handleSave = () => {
    if (!form.keyword) {
      toast.error('Informe a palavra-chave');
      return;
    }
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        data: { ...form, priority: parseInt(form.priority) || 0, active: true },
      });
    } else {
      createMutation.mutate({ ...form, priority: parseInt(form.priority) || 0, active: true });
    }
  };

  const startEdit = (rule) => {
    setEditingId(rule.id);
    setForm({ keyword: rule.keyword, category: rule.category, description: rule.description || '', priority: rule.priority || 0 });
    setShowForm(true);
  };

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('-created_date', 100),
  });

  const sortedRules = [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  const getCategoryLabel = (cat) => categories.find(c => c.slug === cat)?.name || cat;

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="font-medium text-blue-900 mb-1">💡 Como funciona:</p>
        <p className="text-xs">Adicione palavras-chave (ex: "Uber", "Shell", "Petrobras") e defina a categoria automática. A IA usará essas regras para categorizar suas transações. Prioridade maior = verificado primeiro.</p>
      </div>

      {showForm && (
        <div className="border border-primary/20 rounded-xl p-4 space-y-3 bg-accent/20">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Palavra-chave (ex: Uber, Shell, Petrobras)</Label>
              <Input
                value={form.keyword}
                onChange={(e) => setForm({ ...form, keyword: e.target.value.toUpperCase() })}
                className="mt-1 text-sm"
                placeholder="UBER"
              />
            </div>
            <div>
              <Label className="text-xs">Prioridade</Label>
              <Input
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="mt-1 text-sm"
                placeholder="0"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Descrição Normalizada (opcional)</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1 text-sm"
                placeholder="Ex: Uber, Shell, Combustível"
              />
              <p className="text-xs text-muted-foreground mt-1">Se preenchido, substitui a descrição original da transação</p>
            </div>
            <div className="col-span-1">
              <Label className="text-xs">Categoria</Label>
              <CategorySelect
                value={form.category}
                onChange={(v) => setForm({ ...form, category: v })}
                placeholder="Nenhuma"
                className="mt-1 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setForm({ keyword: '', category: '', description: '', priority: 0 });
              }}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} className="flex-1">
              {createMutation.isPending || updateMutation.isPending ? 'Salvando...' : editingId ? 'Atualizar' : 'Adicionar'}
            </Button>
          </div>
        </div>
      )}

      {!showForm && (
        <Button size="sm" onClick={() => setShowForm(true)} className="w-full">
          <Plus className="w-4 h-4 mr-2" /> Nova Regra
        </Button>
      )}

      <div className="divide-y divide-border rounded-lg border border-border overflow-hidden bg-white">
        {sortedRules.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">Nenhuma regra configurada. Adicione a primeira acima.</p>
        )}
        {sortedRules.map((rule) => (
          <div key={rule.id} className="flex items-center justify-between p-3 hover:bg-muted/20 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono bg-slate-100 px-2 py-1 rounded text-slate-700">{rule.keyword}</code>
                {rule.description && (
                  <span className="text-sm font-medium text-slate-700">→ {rule.description}</span>
                )}
                {rule.category && (
                  <Badge className={`text-xs border-0 ${CATEGORY_COLORS[rule.category] || CATEGORY_COLORS.outros}`}>
                    {getCategoryLabel(rule.category)}
                  </Badge>
                )}
                {rule.priority > 0 && (
                  <Badge variant="outline" className="text-xs">
                    ⭐ {rule.priority}
                  </Badge>
                )}
              </div>
              {rule.notes && <p className="text-xs text-muted-foreground mt-1">{rule.notes}</p>}
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 text-muted-foreground hover:text-primary"
                onClick={() => startEdit(rule)}
              >
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 text-muted-foreground hover:text-red-500"
                onClick={() => deleteMutation.mutate(rule.id)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}