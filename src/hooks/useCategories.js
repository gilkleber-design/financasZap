import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export function useCategories() {
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('name', 200),
  });

  // Raízes (sem parent_id)
  const rootCategories = categories.filter(c => !c.parent_id && c.active !== false);

  // Filhos de um pai
  const childrenOf = (parentId) =>
    categories.filter(c => c.parent_id === parentId && c.active !== false);

  // Lista plana para selects: categoria raiz + subcategorias indentadas
  const flatForSelect = rootCategories.flatMap(root => [
    { value: root.slug, label: root.name, id: root.id, isRoot: true },
    ...childrenOf(root.id).map(child => ({
      value: child.slug,
      label: `  ↳ ${child.name}`,
      id: child.id,
      isRoot: false,
    })),
  ]);

  return { categories, rootCategories, childrenOf, flatForSelect, isLoading };
}