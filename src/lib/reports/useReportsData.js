import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { buildReportsData } from './reportsData.js';

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
    return buildReportsData({
      transactions,
      payables,
      categories,
      receivables,
      budgets,
      incomeSources,
      month,
      incluirCartao,
    });
  }, [transactions, payables, categories, receivables, budgets, incomeSources, month, incluirCartao]);

  return { data, isLoading };
}