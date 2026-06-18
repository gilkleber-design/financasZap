import { useState } from 'react';
import { format, subMonths, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useReportsData } from '@/lib/reports/useReportsData';
import InvariantBanner from '@/components/reports/InvariantBanner';
import CategoryGroupingToggle from '@/components/reports/CategoryGroupingToggle';
import IncluirCartaoToggle from '@/components/reports/IncluirCartaoToggle';
import AtividadeTab from '@/components/reports/AtividadeTab';
import ContasAPagarTab from '@/components/reports/ContasAPagarTab';
import ReconciliacaoTab from '@/components/reports/ReconciliacaoTab';
import PayableDetailDrawer from '@/components/reports/PayableDetailDrawer';
import ConsolidatedReportModal from '@/components/reports/ConsolidatedReportModal';

export default function Reports() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [grouping, setGrouping] = useState(localStorage.getItem('relatorios_grouping') || 'leaf');
  const [incluirCartao, setIncluirCartao] = useState(localStorage.getItem('relatorios_incluir_cartao') !== 'false');
  const [selectedPayable, setSelectedPayable] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [consolidatedOpen, setConsolidatedOpen] = useState(false);

  const month = format(currentMonth, 'yyyy-MM');
  const { data: rd, isLoading } = useReportsData(month, incluirCartao);

  const handlePayableClick = (item) => {
    if (item.status) { setSelectedPayable(item); setDrawerOpen(true); }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-sora font-bold">Relatórios</h1>
          <p className="text-muted-foreground text-sm mt-1">Visão financeira completa</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium min-w-[140px] text-center capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <IncluirCartaoToggle value={incluirCartao} onChange={setIncluirCartao} />
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-24 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && rd && (
        <>
          <InvariantBanner invariantes={rd.invariantes} />

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CategoryGroupingToggle value={grouping} onChange={setGrouping} />
          </div>

          <Tabs defaultValue="atividade" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-[#E8EDF2] p-1 rounded-xl">
              <TabsTrigger value="atividade" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#0D3B66] font-semibold text-[#7B92A8]">
                Atividade
              </TabsTrigger>
              <TabsTrigger value="contas" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#0D3B66] font-semibold text-[#7B92A8]">
                Contas a Pagar
              </TabsTrigger>
              <TabsTrigger value="reconciliacao" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#0D3B66] font-semibold text-[#7B92A8]">
                Reconciliação
              </TabsTrigger>
            </TabsList>

            <TabsContent value="atividade" className="mt-6">
              <AtividadeTab
                data={rd.atividade}
                byMonth6={rd.byMonth6}
                fiscal={rd.fiscal}
                grouping={grouping}
                incluirCartao={incluirCartao}
                onOpenConsolidated={() => setConsolidatedOpen(true)}
                currentMonth={currentMonth}
              />
            </TabsContent>

            <TabsContent value="contas" className="mt-6">
              <ContasAPagarTab
                data={rd.contasAPagar}
                grouping={grouping}
                incluirCartao={incluirCartao}
                onRowClick={handlePayableClick}
              />
            </TabsContent>

            <TabsContent value="reconciliacao" className="mt-6">
              <ReconciliacaoTab data={rd.reconciliacao} />
            </TabsContent>
          </Tabs>
        </>
      )}

      <PayableDetailDrawer open={drawerOpen} onOpenChange={setDrawerOpen} payable={selectedPayable} />
      <ConsolidatedReportModal open={consolidatedOpen} onOpenChange={setConsolidatedOpen} currentMonth={currentMonth} />
    </div>
  );
}