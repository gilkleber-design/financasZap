import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

const CATEGORY_COLORS = {
  alimentacao: 'bg-orange-100 text-orange-700',
  transporte: 'bg-yellow-100 text-yellow-700',
  moradia: 'bg-blue-100 text-blue-700',
  saude: 'bg-red-100 text-red-700',
  educacao: 'bg-green-100 text-green-700',
  lazer: 'bg-pink-100 text-pink-700',
  vestuario: 'bg-purple-100 text-purple-700',
  servicos: 'bg-indigo-100 text-indigo-700',
  impostos: 'bg-gray-100 text-gray-700',
  transferencia_liquidacao: 'bg-slate-100 text-slate-700',
  outros: 'bg-slate-100 text-slate-700',
};

export function CategorySelect({ value, onChange, placeholder = 'Selecionar categoria', includeTransfer = false, className = '' }) {
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('-created_date', 100),
  });

  const roots = categories.filter(c => !c.parent_id && c.active !== false);
  const getChildren = (parentId) => categories.filter(c => c.parent_id === parentId && c.active !== false);

  const getCategoryLabel = (slug) => {
    const cat = categories.find(c => c.slug === slug);
    return cat?.name || slug;
  };

  const selectedCategory = categories.find(c => c.slug === value);

  return (
    <Select value={value} onValueChange={onChange} disabled={isLoading}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
        {selectedCategory && (
          <Badge 
            className={`ml-2 text-xs border-0 ${CATEGORY_COLORS[selectedCategory.slug] || CATEGORY_COLORS.outros}`}
          >
            {selectedCategory.name}
          </Badge>
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={null}>Nenhuma</SelectItem>
        {roots.map((cat) => {
          const children = getChildren(cat.id);
          return (
            <div key={cat.id}>
              <SelectItem value={cat.slug} className="font-semibold">
                {cat.name}
              </SelectItem>
              {children.map((child) => (
                <SelectItem key={child.id} value={child.slug} className="ml-4">
                  → {child.name}
                </SelectItem>
              ))}
            </div>
          );
        })}
        {includeTransfer && (
          <SelectItem value="transferencia_liquidacao" className="font-semibold">
            💳 Transferência / Liquidação
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

export { CATEGORY_COLORS };