import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link2, Filter } from 'lucide-react';

const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

export default function LinkHub() {
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState('all');

  const { data: transactions = [], isLoading: isLoadingTransactions } = useQuery({
    queryKey: ['allTransactionsLinkHub'],
    queryFn: async () => {
      return await base44.entities.Transaction.list('-date', 2000);
    },
  });

  const { data: payables = [], isLoading: isLoadingPayables } = useQuery({
    queryKey: ['allPayablesLinkHub'],
    queryFn: () => base44.entities.Payable.list('-due_date', 2000),
  });

  const { data: receivables = [], isLoading: isLoadingReceivables } = useQuery({
    queryKey: ['allReceivablesLinkHub'],
    queryFn: () => base44.entities.Receivable.list('-due_date', 2000),
  });

  const linkMutation = useMutation({
    mutationFn: async ({ transactionId, linkEntityType, linkEntityId }) => {
      // Update Transaction
      const updateTransactionPayload = {
        status: 'registered', 
        reconciled: linkEntityId !== 'none', 
      };
      if (linkEntityType === 'payable') {
        updateTransactionPayload.payable_id = linkEntityId === 'none' ? null : linkEntityId;
      } else if (linkEntityType === 'receivable') {
        updateTransactionPayload.receivable_id = linkEntityId === 'none' ? null : linkEntityId;
      }
      await base44.entities.Transaction.update(transactionId, updateTransactionPayload);

      // Update Payable/Receivable status
      if (linkEntityId !== 'none') {
        if (linkEntityType === 'payable') {
          await base44.entities.Payable.update(linkEntityId, { status: 'paid', transaction_id: transactionId });
        } else if (linkEntityType === 'receivable') {
          await base44.entities.Receivable.update(linkEntityId, { status: 'received', transaction_id: transactionId });
        }
      }
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['allTransactionsLinkHub']);
      queryClient.invalidateQueries(['allPayablesLinkHub']);
      queryClient.invalidateQueries(['allReceivablesLinkHub']);
      toast.success('Lançamento vinculado com sucesso!');
    },
    onError: (error) => {
      toast.error(`Erro ao vincular lançamento: ${error.message}`);
    },
  });

  const uniqueUsers = Array.from(new Set(transactions.map(tx => tx.created_by || 'unknown')));
  const filteredTransactions = selectedUser === 'all' ? transactions : transactions.filter(tx => (tx.created_by || 'unknown') === selectedUser);

  const groupedByUser = filteredTransactions.reduce((acc, tx) => {
    const userEmail = tx.created_by || 'unknown'; 
    if (!acc[userEmail]) {
      acc[userEmail] = { expenses: [], incomes: [] };
    }
    if (tx.type === 'expense') {
      acc[userEmail].expenses.push(tx);
    } else if (tx.type === 'income') {
      acc[userEmail].incomes.push(tx);
    }
    return acc;
  }, {});

  const allLoading = isLoadingTransactions || isLoadingPayables || isLoadingReceivables;

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <h1 className="text-2xl font-sora font-bold text-foreground flex items-center gap-2">
        <Link2 className="w-6 h-6 text-primary" />
        Hub de Amarração Financeira
      </h1>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">Avalie e vincule TODAS as transações lançadas aos compromissos do sistema.</p>
        
        {!allLoading && uniqueUsers.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por Usuário" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Usuários</SelectItem>
                {uniqueUsers.map(u => (
                  <SelectItem key={u} value={u}>{u.split('@')[0]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {allLoading && (
        <div className="flex justify-center items-center h-40">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
        </div>
      )}

      {!allLoading && Object.keys(groupedByUser).length === 0 && (
        <Card className="p-6 text-center text-muted-foreground">
          Nenhuma transação sem vínculo encontrada.
        </Card>
      )}

      {!allLoading && Object.entries(groupedByUser).map(([userEmail, data]) => (
        <Card key={userEmail}>
          <CardHeader>
            <CardTitle className="text-lg">{userEmail.split('@')[0]}</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="expenses">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="expenses">Despesas ({data.expenses.length})</TabsTrigger>
                <TabsTrigger value="incomes">Receitas ({data.incomes.length})</TabsTrigger>
              </TabsList>
              
              <TabsContent value="expenses" className="mt-4">
                {data.expenses.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">Nenhuma despesa sem vínculo para este usuário.</p>
                ) : (
                  <div className="grid gap-4 divide-y">
                    {data.expenses.map(tx => (
                      <div key={tx.id} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-3 first:pt-0">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{tx.description}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(tx.date), 'dd/MM/yyyy', { locale: ptBR })} - <strong className="text-rose-600">{formatCurrency(tx.amount)}</strong>
                          </p>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                          <Select
                            value={tx.payable_id || "none"}
                            onValueChange={(payableId) => {
                              linkMutation.mutate({ transactionId: tx.id, linkEntityType: 'payable', linkEntityId: payableId });
                            }}
                          >
                            <SelectTrigger className="w-full sm:w-[350px]">
                              <SelectValue placeholder="Vincular a Pagar..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Não vinculado</SelectItem>
                              {payables.map(p => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.description} - {formatCurrency(p.amount)} ({p.status})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="incomes" className="mt-4">
                {data.incomes.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">Nenhuma receita sem vínculo para este usuário.</p>
                ) : (
                  <div className="grid gap-4 divide-y">
                    {data.incomes.map(tx => (
                      <div key={tx.id} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-3 first:pt-0">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{tx.description}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(tx.date), 'dd/MM/yyyy', { locale: ptBR })} - <strong className="text-emerald-600">{formatCurrency(tx.amount)}</strong>
                          </p>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                          <Select
                            value={tx.receivable_id || "none"}
                            onValueChange={(receivableId) => {
                              linkMutation.mutate({ transactionId: tx.id, linkEntityType: 'receivable', linkEntityId: receivableId });
                            }}
                          >
                            <SelectTrigger className="w-full sm:w-[350px]">
                              <SelectValue placeholder="Vincular a Receber..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Não vinculado</SelectItem>
                              {receivables.map(r => (
                                <SelectItem key={r.id} value={r.id}>
                                  {r.description} - {formatCurrency(r.amount)} ({r.status})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}