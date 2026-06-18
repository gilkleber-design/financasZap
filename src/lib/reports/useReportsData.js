import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { buildReportsData, resolvePayMonth } from './reportsData.js';

function formatMonthLabel(m) {
  const [y, mo] = m.split('-');
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${months[Number(mo) - 1]}/${String(y).slice(2)}`;
}

export function useReportsData(month, incluirCartao) {
  const { data: transactions = [], isLoading: l1 } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-date', 1000),
    staleTime: 30000,
  });

  const { data: payables = [], isLoading: l2 } = useQuery({
    queryKey: ['payables'],
    queryFn: () => base44.entities.Payable.list('-due_date', 2000),
    staleTime: 30000,
  });

  const { data: categories = [], isLoading: l3 } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('name', 200),
    staleTime: 60000,
  });

  const { data: receivables = [], isLoading: l4 } = useQuery({
    queryKey: ['receivables-reports'],
    queryFn: () => base44.entities.Receivable.list('-due_date', 1000),
    staleTime: 30000,
  });

  const { data: budgets = [], isLoading: l5 } = useQuery({
    queryKey: ['budgets'],
    queryFn: () => base44.entities.Budget.list('-year', 500),
    staleTime: 60000,
  });

  const { data: incomeSources = [], isLoading: l6 } = useQuery({
    queryKey: ['income-sources'],
    queryFn: () => base44.entities.IncomeSource.list('name', 100),
    staleTime: 60000,
  });

  const isLoading = l1 || l2 || l3 || l4 || l5 || l6;

  const data = useMemo(() => {
    if (isLoading) return null;

    // ---- Núcleo: atividade, contasAPagar, reconciliacao ----
    const core = buildReportsData({ transactions, payables, categories, month, incluirCartao });

    // ---- byMonth6: Fluxo de Caixa 6 meses ----
    const conciliatedIds = new Set(transactions.filter(t => t.payable_id).map(t => t.payable_id));

    const byMonth6 = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(month + '-01');
      d.setMonth(d.getMonth() - (5 - i));
      const m = d.toISOString().slice(0, 7);

      const txM = transactions.filter(t => String(t.date || '').slice(0, 7) === m);

      const despesasTx = txM
        .filter(t => t.type === 'expense')
        .reduce((s, t) => s + Number(t.amount || 0), 0);

      const provM = incluirCartao
        ? payables.filter(p => {
            if (resolvePayMonth(p) !== m) return false;
            if (p.status !== 'provisioned' && p.status !== 'pending') return false;
            if (p.origin_type !== 'card') return false;
            return !conciliatedIds.has(p.id);
          }).reduce((s, p) => s + Number(p.amount || 0), 0)
        : 0;

      const despesas = despesasTx + provM;

      const receitas = txM
        .filter(t => t.type === 'income')
        .reduce((s, t) => s + Number(t.net_amount || t.amount || 0), 0);

      return {
        monthKey: m,
        name: formatMonthLabel(m),
        receitas,
        despesas,
        Receitas: receitas,
        Despesas: despesas,
        saldo: receitas - despesas,
      };
    });

    // ---- fiscal: Resumo Fiscal (mantido integralmente) ----
    const incomeSourcesMap = {};
    (incomeSources || []).forEach(s => { incomeSourcesMap[s.id] = s; });

    const recebidosDoMes = (receivables || []).filter(r =>
      r.status === 'received' && String(r.due_date || '').slice(0, 7) === month
    );
    const fiscalBySource = {};
    recebidosDoMes.forEach(item => {
      const key = item.income_source_id || 'outras';
      if (!fiscalBySource[key]) fiscalBySource[key] = { gross: 0, tax: 0 };
      const gross = Number(item.amount || 0);
      const tax = gross * (Number(item.tax_rate || 0) / 100);
      fiscalBySource[key].gross += gross;
      fiscalBySource[key].tax += tax;
    });
    const totalBruto = Object.values(fiscalBySource).reduce((s, i) => s + i.gross, 0);
    const totalImpostos = Object.values(fiscalBySource).reduce((s, i) => s + i.tax, 0);
    const totalLiquido = totalBruto - totalImpostos;
    const aliquotaEfetiva = totalBruto > 0 ? `${((totalImpostos / totalBruto) * 100).toFixed(1)}%` : '0.0%';
    const sourceRows = Object.entries(fiscalBySource).map(([sourceId, data]) => {
      const source = incomeSourcesMap[sourceId];
      return {
        sourceId,
        name: source ? source.name : sourceId === 'outras' ? 'Outras' : '(fonte não encontrada)',
        tax: data.tax,
        gross: data.gross,
      };
    }).sort((a, b) => b.tax - a.tax);

    const fiscal = { totalBruto, totalImpostos, totalLiquido, aliquotaEfetiva, sourceRows };

    // ---- Budget lookup para plannedVsActual (OverviewPlannedVsActual) ----
    // Injeta budget em cada item de byCategoryLeaf e byCategoryRoot
    const [yearStr, monthStr] = month.split('-');
    const yearNum = Number(yearStr);
    const monthNum = Number(monthStr);
    const budgetsDoMes = (budgets || []).filter(b => b.month === monthNum && b.year === yearNum);

    // Indexar categorias para navegar para root
    const catById = new Map(categories.map(c => [c.id, c]));
    const budgetByLeafId = {};
    const budgetByRootId = {};
    budgetsDoMes.forEach(b => {
      const cat = catById.get(b.category_id);
      if (!cat) return;
      const rootId = cat.parent_id ? String(cat.parent_id) : String(cat.id);
      budgetByLeafId[String(cat.id)] = (budgetByLeafId[String(cat.id)] || 0) + Number(b.amount || 0);
      budgetByRootId[rootId] = (budgetByRootId[rootId] || 0) + Number(b.amount || 0);
    });

    // Injeta budget nos grupos (mutação local, não afeta a função pura)
    core.atividade.byCategoryLeaf.forEach(g => { g.budget = budgetByLeafId[g.id] || 0; });
    core.atividade.byCategoryRoot.forEach(g => { g.budget = budgetByRootId[g.id] || 0; });

    // Invariantes: drift de categoria (category texto ≠ category_id)
    // (apenas para o InvariantBanner — não afeta totais)
    const transacoesComDrift = [];
    const payablesComDrift = [];
    for (const t of transactions) {
      if (t.category_id && t.category) {
        const byId = catById.get(t.category_id);
        const bySlug = categories.find(c => c.slug === t.category);
        if (byId && bySlug && byId.id !== bySlug.id) {
          transacoesComDrift.push({ id: t.id, description: t.description, amount: t.amount, date: t.date, drift: { hasMismatch: true } });
        }
      }
    }
    for (const p of payables) {
      if (p.category_id && p.category) {
        const byId = catById.get(p.category_id);
        const bySlug = categories.find(c => c.slug === p.category);
        if (byId && bySlug && byId.id !== bySlug.id) {
          payablesComDrift.push({ id: p.id, description: p.description, amount: p.amount, drift: { hasMismatch: true } });
        }
      }
    }
    const categoriasOrfas = categories.filter(c => {
      if (!c.parent_id) return false;
      return !catById.get(String(c.parent_id));
    }).map(c => ({ id: c.id, name: c.name, slug: c.slug, missingParentId: c.parent_id }));

    const invariantes = {
      confrontoFecha: Math.abs(core.reconciliacao.confronto.diferenca) < 1,
      diferencaInexplicada: Math.abs(core.reconciliacao.confronto.diferenca),
      transacoesComDrift,
      payablesComDrift,
      categoriasOrfas,
    };

    return {
      ...core,
      byMonth6,
      fiscal,
      invariantes,
    };
  }, [transactions, payables, categories, receivables, budgets, incomeSources, month, incluirCartao]);

  return { data, isLoading };
}