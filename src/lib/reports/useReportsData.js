import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { buildReportsData } from './reportsData.js';

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

    // Estrutura principal
    const core = buildReportsData({ transactions, payables, categories, month, incluirCartao });

    // Fluxo de caixa 6 meses (mesma lógica de atividade por mês)
    const payMonth = p => p.origin_type === 'card'
      ? String(p.due_date || '').slice(0, 7)
      : String(p.competencia || p.due_date || '').slice(0, 7);
    const conciliatedIds = new Set(transactions.filter(t => t.payable_id).map(t => t.payable_id));

    const catById = new Map();
    const catBySlug = new Map();
    for (const c of categories) {
      catById.set(c.id, c);
      if (c.slug) catBySlug.set(String(c.slug).toLowerCase(), c);
    }
    function resolveType(record) {
      const byId = record.category_id ? catById.get(record.category_id) : null;
      const bySlug = record.category ? catBySlug.get(String(record.category).toLowerCase()) : null;
      const cat = byId || bySlug;
      return cat?.type || null;
    }

    const byMonth6 = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(month + '-01');
      d.setMonth(d.getMonth() - (5 - i));
      const m = d.toISOString().slice(0, 7);

      const txM = transactions.filter(t => String(t.date || '').slice(0, 7) === m);

      const despesas = txM.filter(t => t.type === 'expense' && resolveType(t) !== 'transfer')
          .reduce((s, t) => s + Number(t.amount || 0), 0)
        + (incluirCartao
          ? payables.filter(p =>
              payMonth(p) === m &&
              p.status === 'provisioned' &&
              p.origin_type === 'card' &&
              !conciliatedIds.has(p.id) &&
              resolveType(p) !== 'transfer'
            ).reduce((s, p) => s + Number(p.amount || 0), 0)
          : 0);

      const receitas = txM.filter(t => t.type === 'income')
        .reduce((s, t) => s + Number(t.net_amount || t.amount || 0), 0);

      return {
        monthKey: m,
        name: formatMonthLabel(m),
        receitas, despesas,
        Receitas: receitas,
        Despesas: despesas,
        saldo: receitas - despesas,
      };
    });

    // Fiscal (resumo fiscal — mantém lógica existente)
    const incomeSourcesMap = {};
    (incomeSources || []).forEach(s => { incomeSourcesMap[s.id] = s; });

    const [yearStr, monthStr] = month.split('-');
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

    // Drift de categoria (para InvariantBanner)
    const transacoesComDrift = [];
    const payablesComDrift = [];
    for (const t of transactions) {
      if (t.category_id && t.category) {
        const byId = catById.get(t.category_id);
        const bySlug = catBySlug.get(String(t.category).toLowerCase());
        if (byId && bySlug && byId.id !== bySlug.id) {
          transacoesComDrift.push({ id: t.id, description: t.description, amount: t.amount, date: t.date });
        }
      }
    }
    for (const p of payables) {
      if (p.category_id && p.category) {
        const byId = catById.get(p.category_id);
        const bySlug = catBySlug.get(String(p.category).toLowerCase());
        if (byId && bySlug && byId.id !== bySlug.id) {
          payablesComDrift.push({ id: p.id, description: p.description, amount: p.amount });
        }
      }
    }

    const invariantes = {
      confrontoFecha: Math.abs(core.reconciliacao.confronto.diferenca) < 1,
      diferencaInexplicada: Math.abs(core.reconciliacao.confronto.diferenca),
      transacoesComDrift,
      payablesComDrift,
      categoriasOrfas: categories.filter(c => c.parent_id && !catById.get(c.parent_id))
        .map(c => ({ id: c.id, name: c.name, slug: c.slug, missingParentId: c.parent_id })),
    };

    return { ...core, fiscal, byMonth6, invariantes };
  }, [transactions, payables, categories, receivables, budgets, incomeSources, month, incluirCartao]);

  return { data, isLoading };
}