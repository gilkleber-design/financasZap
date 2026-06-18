import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

// Recebe aggregation (byCategoryLeaf ou byCategoryRoot), budgets e month.
// Budget lookup acontece aqui por categoryId — componente NÃO recalcula atividade.
export default function OverviewPlannedVsActual({ aggregation, budgets = [], month, currentMonth }) {
  const budgetByCatId = useMemo(() => {
    const [yearStr, monthStr] = (month || '').split('-');
    const yearNum = Number(yearStr);
    const monthNum = Number(monthStr);
    const map = {};
    for (const b of budgets) {
      if (b.month === monthNum && b.year === yearNum) {
        map[b.category_id] = (map[b.category_id] || 0) + Number(b.amount || 0);
      }
    }
    return map;
  }, [budgets, month]);

  return (
    <Card className="border border-[#E8EDF2] shadow-sm">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base font-semibold text-[#0D3B66]">
          Planejado vs realizado — {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
        </CardTitle>
        <Button asChild variant="outline" className="h-8 border-[0.5px] border-[#0FA3A3] bg-transparent px-3 text-[11px] font-bold text-[#0FA3A3] hover:bg-[#0FA3A3]/5 hover:text-[#0FA3A3]">
          <Link to="/planejamento">editar limites</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {aggregation.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            Nenhuma despesa registrada neste mês.
          </p>
        ) : (
          aggregation.map((item) => {
            const limit = budgetByCatId[item.id] || 0;
            const hasLimit = limit > 0;
            const actual = item.total;
            const overLimit = hasLimit && actual > limit;
            const cappedPercent = hasLimit ? Math.min((actual / limit) * 100, 100) : 0;
            return (
              <div key={item.id} className="flex flex-col gap-3 rounded-[10px] border border-[#E8EDF2] bg-white px-4 py-3 lg:flex-row lg:items-center lg:gap-4">
                <div className="min-w-0 lg:w-52 lg:flex-shrink-0">
                  <div className="flex items-center gap-2">
                    {item.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />}
                    <span className="text-xs font-bold text-[#0D3B66]">{item.name}</span>
                    {!hasLimit && <Badge className="bg-[#FFECEC] px-1.5 py-0 text-[9px] font-bold text-[#C0392B] hover:bg-[#FFECEC]">sem limite</Badge>}
                  </div>
                </div>

                {hasLimit ? (
                  <div className="flex flex-1 items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#F0F4F8]">
                      <div
                        className={`h-full rounded-full ${overLimit ? 'bg-[#E74C3C]' : 'bg-[#0FA3A3]'}`}
                        style={{ width: `${cappedPercent}%` }}
                      />
                    </div>
                    <div className={`whitespace-nowrap text-[11px] ${overLimit ? 'text-[#C0392B]' : 'text-[#7B92A8]'}`}>
                      <b className={overLimit ? 'text-[#C0392B]' : 'text-[#0D3B66]'}>{fmt(actual)}</b> / {fmt(limit)}
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-[#C0392B]">
                    <b>{fmt(actual)}</b>
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}