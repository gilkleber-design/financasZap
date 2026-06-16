import { useMemo, useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, CartesianGrid } from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import AuditReportAccordion from '@/components/reports/AuditReportAccordion';
import PayableDetailDrawer from '@/components/reports/PayableDetailDrawer';
import ConsolidatedReportModal from '@/components/reports/ConsolidatedReportModal';
import AuditCategoryPieChart from '@/components/reports/AuditCategoryPieChart';
import OverviewPlannedVsActual from '@/components/reports/OverviewPlannedVsActual';
import OverviewFiscalSummary from '@/components/reports/OverviewFiscalSummary';
import PayableStatusCards from '@/components/reports/PayableStatusCards';
import ReconciliationConfront from '@/components/reports/ReconciliationConfront';
import ReconciliationLists from '@/components/reports/ReconciliationLists';
import { categorizeByRoot } from '@/lib/categoryHierarchy';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function Reports() {
  const [selectedPayable, setSelectedPayable] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [consolidatedModalOpen, setConsolidatedModalOpen] = useState(false);

  const selectedMonthStr = format(currentMonth, 'yyyy-MM');
  const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-date', 500),
  });

  const { data: payables = [] } = useQuery({
    queryKey: ['payables'],
    queryFn: () => base44.entities.Payable.list('-due_date', 1000),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('name', 100),
  });

  const { data: incomeSources = [] } = useQuery({
    queryKey: ['income-sources'],
    queryFn: () => base44.entities.IncomeSource.list('name', 100),
  });

  const { data: receivables = [] } = useQuery({
    queryKey: ['receivables-reports'],
    queryFn: () => base44.entities.Receivable.list('-due_date', 1000),
  });

  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets'],
    queryFn: () => base44.entities.Budget.list('-year', 500),
  });

  const handlePayableClick = (payable) => {
    setSelectedPayable(payable);
    setDrawerOpen(true);
  };

  // ---- ABA 1: REALIZADO ----
  // Fonte única: transactions filtradas por t.date no mês
  const monthTx = useMemo(() => {
    return transactions.filter(t => t.date >= monthStart && t.date <= monthEnd);
  }, [transactions, monthStart, monthEnd]);

  // Fluxo de Caixa — 6 meses anteriores ao mês selecionado
  const months = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(currentMonth, 5 - i);
    const start = format(startOfMonth(d), 'yyyy-MM-dd');
    const end = format(endOfMonth(d), 'yyyy-MM-dd');
    const monthFiltered = transactions.filter(t => t.date >= start && t.date <= end);
    const income = monthFiltered.filter(t => t.type === 'income').reduce((s, t) => s + (t.net_amount ?? t.amount), 0);
    const expense = monthFiltered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return {
      name: format(d, 'MMM/yy', { locale: ptBR }),
      Receitas: income,
      Despesas: expense,
      Saldo: income - expense,
    };
  }), [transactions, currentMonth]);

  // Donut despesas por categoria — agrupado por raiz via categorizeByRoot
  const categoryData = useMemo(() => {
    const grouped = {};
    monthTx.filter(t => t.type === 'expense').forEach(t => {
      const { rootId, rootName, rootColor } = categorizeByRoot(t, categories);
      if (!grouped[rootId]) grouped[rootId] = { name: rootName, color: rootColor, value: 0 };
      grouped[rootId].value += (t.amount || 0);
    });
    const all = Object.values(grouped).sort((a, b) => b.value - a.value);
    if (all.length > 6) {
      const others = all.slice(6).reduce((s, i) => s + i.value, 0);
      return [...all.slice(0, 6), { name: 'Demais Categorias', color: '#E2E8F0', value: others }];
    }
    return all;
  }, [monthTx, categories]);

  // Planejado vs Realizado — agrupado por categoria raiz
  const plannedVsActual = useMemo(() => {
    const categoryIdToSlug = new Map(categories.map(c => [c.id, String(c.slug || '').toLowerCase()]));
    const budgetBySlug = budgets.reduce((acc, b) => {
      const slug = categoryIdToSlug.get(b.category_id);
      if (slug && b.month === currentMonth.getMonth() + 1 && b.year === currentMonth.getFullYear()) {
        acc[slug] = Number(b.amount || 0);
      }
      return acc;
    }, {});

    // Também montar budget por root category id
    const budgetByRootId = {};
    budgets.forEach(b => {
      if (b.month !== currentMonth.getMonth() + 1 || b.year !== currentMonth.getFullYear()) return;
      const cat = categories.find(c => c.id === b.category_id);
      if (!cat) return;
      const rootId = cat.parent_id ? cat.parent_id : cat.id;
      budgetByRootId[rootId] = (budgetByRootId[rootId] || 0) + Number(b.amount || 0);
    });

    const actualByRootId = {};
    const rootMeta = {};
    monthTx.filter(t => t.type === 'expense').forEach(t => {
      const { rootId, rootName, rootColor } = categorizeByRoot(t, categories);
      if (!actualByRootId[rootId]) actualByRootId[rootId] = 0;
      actualByRootId[rootId] += Number(t.amount || 0);
      if (!rootMeta[rootId]) rootMeta[rootId] = { name: rootName, slug: rootId };
    });

    const allIds = new Set([...Object.keys(budgetByRootId), ...Object.keys(actualByRootId)]);
    const items = Array.from(allIds).map(rootId => {
      const actual = actualByRootId[rootId] || 0;
      const limit = budgetByRootId[rootId] || 0;
      const hasLimit = limit > 0;
      const percent = hasLimit ? (actual / limit) * 100 : 0;
      const cat = categories.find(c => c.id === rootId);
      const name = cat?.name || rootMeta[rootId]?.name || rootId;
      return { slug: rootId, name, actual, limit, hasLimit, percent };
    });

    return items.sort((a, b) => {
      if (a.hasLimit && b.hasLimit) return b.percent - a.percent;
      if (a.hasLimit) return -1;
      if (b.hasLimit) return 1;
      return b.actual - a.actual;
    });
  }, [budgets, categories, currentMonth, monthTx]);

  // Resumo Fiscal
  const receivedReceivables = receivables.filter(item => item.status === 'received' && item.due_date >= monthStart && item.due_date <= monthEnd);
  const fiscalBySource = receivedReceivables.reduce((acc, item) => {
    const key = item.income_source_id || 'outras';
    if (!acc[key]) acc[key] = { gross: 0, tax: 0 };
    const gross = Number(item.amount || 0);
    const tax = gross * (Number(item.tax_rate || 0) / 100);
    acc[key].gross += gross;
    acc[key].tax += tax;
    return acc;
  }, {});
  const totalGross = receivedReceivables.reduce((s, item) => s + Number(item.amount || 0), 0);
  const totalTax = Object.values(fiscalBySource).reduce((s, item) => s + item.tax, 0);
  const totalNet = totalGross - totalTax;
  const effectiveRate = totalGross > 0 ? `${((totalTax / totalGross) * 100).toFixed(1)}%` : '0.0%';
  const sourceRows = Object.entries(fiscalBySource)
    .map(([sourceId, data]) => ({
      name: sourceId === 'outras' ? 'Outras' : (incomeSources.find(s => s.id === sourceId)?.name || 'PJ não identificada'),
      tax: data.tax,
    }))
    .sort((a, b) => b.tax - a.tax);

  // ---- ABA 2: CONTAS A PAGAR ----
  // Fonte única: payables filtrados por competencia || due_date no mês (sem orphans)
  const filteredPayables = useMemo(() => payables.filter(p => {
    if (p.is_card_invoice_payable) return false;
    const ref = p.competencia || p.due_date;
    if (!ref) return false;
    return format(new Date(ref), 'yyyy-MM') === selectedMonthStr;
  }), [payables, selectedMonthStr]);

  // ---- ABA 3: RECONCILIAÇÃO ----
  const realizadoExpense = useMemo(() =>
    monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0),
  [monthTx]);

  const contasAPagarTotal = useMemo(() =>
    filteredPayables.reduce((s, p) => s + (p.amount || 0), 0),
  [filteredPayables]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-sora font-bold">Relatórios</h1>
          <p className="text-muted-foreground text-sm mt-1">Visão financeira completa</p>
        </div>
        <div className="flex items-center gap-2">
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
      </div>

      <Tabs defaultValue="realizado" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-[#E8EDF2] p-1 rounded-xl">
          <TabsTrigger value="realizado" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#0D3B66] font-semibold text-[#7B92A8] transition-all">
            Realizado
          </TabsTrigger>
          <TabsTrigger value="contas" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#0D3B66] font-semibold text-[#7B92A8] transition-all">
            Contas a Pagar
          </TabsTrigger>
          <TabsTrigger value="reconciliacao" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#0D3B66] font-semibold text-[#7B92A8] transition-all">
            Reconciliação
          </TabsTrigger>
        </TabsList>

        {/* ===== ABA 1: REALIZADO ===== */}
        <TabsContent value="realizado" className="mt-6 space-y-6">

          <div className="bg-white border-[0.5px] border-[#E8EDF2] border-l-[4px] border-l-[#0D3B66] shadow-[0_1px_4px_rgba(13,59,102,0.06)] rounded-xl py-4 px-[18px] flex items-center justify-between gap-4">
            <div>
              <h3 className="text-[14px] font-bold text-[#0D3B66] mb-0.5">Relatório Consolidado</h3>
              <p className="text-[12px] text-[#7B92A8]">Movimentação financeira efetiva de {format(currentMonth, 'MMMM/yyyy', { locale: ptBR })}</p>
            </div>
            <button
              onClick={() => setConsolidatedModalOpen(true)}
              className="bg-[#0D3B66] hover:bg-[#0a2f54] text-white border-none rounded-lg py-2 px-4 text-[12px] font-bold cursor-pointer whitespace-nowrap shrink-0 transition-colors shadow-sm"
            >
              Ver Completo
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Fluxo de Caixa */}
            <Card className="bg-white border-[0.5px] border-[#E8EDF2] rounded-[16px] p-5 shadow-[0_1px_4px_rgba(13,59,102,0.06)]">
              <h3 className="text-[13px] font-bold text-[#0D3B66] mb-4">Fluxo de Caixa — Últimos 6 Meses</h3>
              <div className="relative h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={months} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#F0F4F8" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#7B92A8', fontSize: 11 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#7B92A8', fontSize: 10 }} tickFormatter={v => `R$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
                    <Tooltip
                      cursor={{ fill: 'rgba(13, 59, 102, 0.05)' }}
                      contentStyle={{ backgroundColor: '#0D3B66', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '11px' }}
                      itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                      formatter={(v) => [fmt(v), '']}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', color: '#7B92A8', paddingTop: '10px' }} />
                    <Bar dataKey="Receitas" fill="#0FA3A3" radius={[6, 6, 0, 0]} barSize={24} />
                    <Bar dataKey="Despesas" fill="#F08080" radius={[6, 6, 0, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Donut por categoria */}
            <Card className="bg-white border-[0.5px] border-[#E8EDF2] rounded-[16px] p-5 shadow-[0_1px_4px_rgba(13,59,102,0.06)]">
              <h3 className="text-[13px] font-bold text-[#0D3B66] mb-4">Despesas por Categoria (Mês Atual)</h3>
              <div className="relative h-[200px]">
                {categoryData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Nenhuma despesa neste mês</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryData} cx="50%" cy="50%" innerRadius="62%" outerRadius={80} dataKey="value" stroke="#FFFFFF" strokeWidth={2}>
                        {categoryData.map((item, i) => <Cell key={item.name || i} fill={item.color} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0D3B66', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '11px' }}
                        formatter={(value, name) => {
                          const total = categoryData.reduce((acc, curr) => acc + curr.value, 0);
                          const pct = ((value / total) * 100).toFixed(1);
                          return [`${fmt(value)} (${pct}%)`, name];
                        }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} formatter={(value) => <span style={{ color: '#7B92A8' }}>{value}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>

          <OverviewPlannedVsActual items={plannedVsActual} currentMonth={currentMonth} />

          <OverviewFiscalSummary
            totalGross={totalGross}
            totalTax={totalTax}
            totalNet={totalNet}
            effectiveRate={effectiveRate}
            sourceRows={sourceRows}
          />
        </TabsContent>

        {/* ===== ABA 2: CONTAS A PAGAR ===== */}
        <TabsContent value="contas" className="mt-6 space-y-6">
          <p className="text-sm text-muted-foreground">Contas com competência em {format(currentMonth, 'MMMM/yyyy', { locale: ptBR })} — pagas, pendentes e vencidas</p>

          <PayableStatusCards payables={filteredPayables} />

          <AuditCategoryPieChart auditData={filteredPayables} categories={categories} />

          <AuditReportAccordion
            payables={filteredPayables}
            onRowClick={handlePayableClick}
            categories={categories}
          />
        </TabsContent>

        {/* ===== ABA 3: RECONCILIAÇÃO ===== */}
        <TabsContent value="reconciliacao" className="mt-6 space-y-6">
          <p className="text-sm text-muted-foreground">Por que o Realizado e as Contas a Pagar não fecham?</p>

          <ReconciliationConfront
            realizado={realizadoExpense}
            contasAPagar={contasAPagarTotal}
          />

          <ReconciliationLists
            transactions={transactions}
            payables={payables}
            categories={categories}
            selectedMonthStr={selectedMonthStr}
          />
        </TabsContent>
      </Tabs>

      <PayableDetailDrawer open={drawerOpen} onOpenChange={setDrawerOpen} payable={selectedPayable} />
      <ConsolidatedReportModal open={consolidatedModalOpen} onOpenChange={setConsolidatedModalOpen} currentMonth={currentMonth} />
    </div>
  );
}