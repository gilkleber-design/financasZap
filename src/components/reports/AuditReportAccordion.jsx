import { useState } from 'react';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search } from 'lucide-react';
import { format } from 'date-fns';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const sanitize = (desc) => {
  if (!desc) return desc;
  return desc.replace(/\s+(SAO PAULO|SALVADOR|CURITIBA|VITORIA|RIO DE JANEIRO|BELO HORIZONTE|BRASILIA|FORTALEZA|RECIFE|MANAUS|PORTO ALEGRE|BRA|BR)$/gi, '').trim();
};

const TODAY = new Date().toISOString().slice(0, 10);

function StatusBadge({ item }) {
  const status = item.status;
  const isVencido = status === 'pending' && (item.dueDate || item.due_date) < TODAY;
  if (isVencido) return <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-red-100 text-red-700 border-red-200">Vencido</span>;
  const cfg = {
    paid:        'bg-emerald-100 text-emerald-700 border-emerald-200',
    conciliated: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    pending:     'bg-slate-100 text-slate-600 border-slate-200',
    provisioned: 'bg-blue-100 text-blue-700 border-blue-200',
  };
  const label = { paid: 'Pago', conciliated: 'Conciliado', pending: 'Pendente', provisioned: 'Provisionado' };
  const cls = cfg[status] || 'bg-slate-100 text-slate-600 border-slate-200';
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${cls}`}>{label[status] || status}</span>;
}

export default function AuditReportAccordion({ aggregation = [], onRowClick, onCategoryClick }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState([]);

  const filtered = search
    ? aggregation.map(g => ({
        ...g,
        items: g.items.filter(i => sanitize(i.description || '').toLowerCase().includes(search.toLowerCase())),
      })).filter(g => g.items.length > 0)
    : aggregation;

  const total = filtered.reduce((s, g) => s + g.total, 0);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por descrição..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {filtered.length === 0 ? (
        <Card className="border-0 shadow-sm"><CardContent className="py-8 text-center text-muted-foreground">Nenhum lançamento encontrado.</CardContent></Card>
      ) : (
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Detalhamento por categoria</CardTitle>
            <Badge variant="secondary">{fmt(total)}</Badge>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple" value={open} onValueChange={setOpen}>
              {filtered.map((cat, idx) => (
                <AccordionItem key={idx} value={String(idx)} className="border-b last:border-0">
                  <AccordionTrigger className="py-4 hover:no-underline">
                    <div className="flex items-center justify-between w-full pr-4">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color || '#94A3B8' }} />
                        <span className="font-bold text-slate-700">{cat.categoryName}</span>
                      </div>
                      <button
                        className="ml-auto mr-2"
                        onClick={e => { e.stopPropagation(); onCategoryClick && onCategoryClick({ categoryName: cat.categoryName, total: cat.total, items: cat.items }); }}
                      >
                        <Badge variant="default" className="bg-primary/90">{fmt(cat.total)}</Badge>
                      </button>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="text-muted-foreground border-b">
                          <tr>
                            <th className="text-left py-2 px-1 font-medium">Data</th>
                            <th className="text-left py-2 px-1 font-medium">Descrição</th>
                            <th className="text-center py-2 px-1 font-medium">Status</th>
                            <th className="text-right py-2 px-1 font-medium">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {cat.items.map(item => {
                            const date = item.dueDate || item.due_date || item.date || item.competencia;
                            return (
                              <tr
                                key={item.id}
                                onClick={() => onRowClick && onRowClick(item)}
                                className="hover:bg-primary/5 cursor-pointer transition-colors"
                              >
                                <td className="py-2 px-1 whitespace-nowrap">{date ? (() => { try { return format(new Date(date), 'dd/MM/yy'); } catch { return '--'; } })() : '--'}</td>
                                <td className="py-2 px-1 font-medium text-slate-700">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {sanitize(item.description)}
                                    {item.jaContadoEmAtividade && (
                                      <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold shrink-0">já contado</span>
                                    )}
                                    {item.source === 'payable_card' && (
                                      <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold shrink-0">cartão</span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 px-1 text-center">{item.status ? <StatusBadge item={item} /> : '-'}</td>
                                <td className="py-2 px-1 text-right font-bold text-slate-900">{fmt(item.amount || item._amount)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  );
}