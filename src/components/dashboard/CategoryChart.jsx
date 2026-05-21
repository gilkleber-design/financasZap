import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useCategories } from '@/hooks/useCategories';

const COLORS = ['#6366f1', '#22c55e', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6', '#84cc16'];

export default function CategoryChart({ data }) {
  const { getCategoryLabel } = useCategories();
  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const capitalize = (str) => str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

  if (!data.length) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">Despesas por Categoria</CardTitle></CardHeader>
        <CardContent className="h-48 flex items-center justify-center text-muted-foreground text-sm">
          Nenhuma despesa neste mês
        </CardContent>
      </Card>
    );
  }

  // Ordena decrescente e limita aos 7 maiores
  const sorted = data
    .map(d => ({ ...d, name: getCategoryLabel(d.name) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 7)
    .map(d => ({ ...d, name: capitalize(d.name.replace(/_/g, ' ')) }));

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader><CardTitle className="text-base">Despesas por Categoria</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
         <BarChart data={sorted} layout="vertical" margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
         <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis type="number" hide />
          <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(v) => fmt(v)} />
          <Bar dataKey="value" fill="hsl(var(--chart-1))" radius={[0, 8, 8, 0]} />
        </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}