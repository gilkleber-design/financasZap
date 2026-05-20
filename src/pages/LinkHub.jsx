import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link2, Filter, Save } from 'lucide-react';

const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

export default function LinkHub() {
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState('all');
  const [pendingEdits, setPendingEdits] = useState({});

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => base44.entities.Account.list() });
  const { data: cards = [] } = useQuery({ queryKey: ['cards'], queryFn: () => base44.entities.Card.list() });

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

  const handleEdit = (txId, field, value) => setPendingEdits(prev => ({ ...prev, [txId]: { ...prev[txId], [field]: value } }));

  const handleLinkChange = (tx, type, value) => {
    if (value === 'remove') {
      if (window.confirm('Tem certeza que deseja remover esta ligação?')) {
        handleEdit(tx.id, type === 'payable' ? 'payable_id' : 'receivable_id', 'none');
      }
    } else {
      handleEdit(tx.id, type === 'payable' ? 'payable_id' : 'receivable_id', value);
    }
  };

  const getOriginValue = (tx) => {
    const edit = pendingEdits[tx.id];
    if (edit && edit.origin !== undefined) return edit.origin;
    if (tx.account_id) return `account_${tx.account_id}`;
    if (tx.card_id) return `card_${tx.card_id}`;
    return 'none';
  };

  const getLinkValue = (tx, type) => {
    const edit = pendingEdits[tx.id];
    const field = type === 'payable' ? 'payable_id' : 'receivable_id';
    if (edit && edit[field] !== undefined) return edit[field];
    return tx[field] || 'none';
  };

  const saveAllMutation = useMutation({
    mutationFn: async () => {
      const promises = Object.entries(pendingEdits).map(async ([txId, edits]) => {
        const originalTx = transactions.find(t => t.id === txId);
        if (!originalTx) return;

        const updateTx = { status: 'registered', reconciled: false };

        if (edits.origin !== undefined) {
          if (edits.origin === 'none') {
            updateTx.account_id = "";
            updateTx.card_id = "";
          } else if (edits.origin.startsWith('account_')) {
            updateTx.account_id = edits.origin.replace('account_', '');
            updateTx.card_id = "";
          } else if (edits.origin.startsWith('card_')) {
            updateTx.card_id = edits.origin.replace('card_', '');
            updateTx.account_id = "";
          }
        }

        if (edits.payable_id !== undefined) {
          updateTx.payable_id = edits.payable_id === 'none' ? "" : edits.payable_id;
          if (originalTx.payable_id && originalTx.payable_id !== edits.payable_id) {
            if (edits.payable_id === 'none') {
              try { await base44.entities.Payable.delete(originalTx.payable_id); } catch(e) { console.error(e) }
            } else {
              try { await base44.entities.Payable.update(originalTx.payable_id, { status: 'pending', transaction_id: "" }); } catch(e) {}
            }
          }
          if (edits.payable_id !== 'none') {
            try { await base44.entities.Payable.update(edits.payable_id, { status: 'paid', transaction_id: txId }); } catch(e) {}
          }
        }

        if (edits.receivable_id !== undefined) {
          updateTx.receivable_id = edits.receivable_id === 'none' ? "" : edits.receivable_id;
          if (originalTx.receivable_id && originalTx.receivable_id !== edits.receivable_id) {
            if (edits.receivable_id === 'none') {
              try { await base44.entities.Receivable.delete(originalTx.receivable_id); } catch(e) { console.error(e) }
            } else {
              try { await base44.entities.Receivable.update(originalTx.receivable_id, { status: 'pending', transaction_id: "" }); } catch(e) {}
            }
          }
          if (edits.receivable_id !== 'none') {
            try { await base44.entities.Receivable.update(edits.receivable_id, { status: 'received', transaction_id: txId }); } catch(e) {}
          }
        }

        await base44.entities.Transaction.update(txId, updateTx);
      });
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allTransactionsLinkHub'] });
      queryClient.invalidateQueries({ queryKey: ['allPayablesLinkHub'] });
      queryClient.invalidateQueries({ queryKey: ['allReceivablesLinkHub'] });
      setPendingEdits({});
      toast.success('Alterações salvas com sucesso!');
    },
    onError: (err) => toast.error('Erro: ' + err.message)
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
  const hasPendingChanges = Object.keys(pendingEdits).length > 0;

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-sora font-bold text-foreground flex items-center gap-2">
            <Link2 className="w-6 h-6 text-primary" />
            Hub de Amarração Financeira
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Avalie transações, vincule compromissos e defina as origens.</p>
        </div>
        {hasPendingChanges && (
          <Button onClick={() => saveAllMutation.mutate()} disabled={saveAllMutation.isPending} className="gap-2 shrink-0">
            <Save className="w-4 h-4" />
            {saveAllMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
                      <div key={tx.id} className="flex flex-col xl:flex-row items-start xl:items-center gap-3 pt-3 first:pt-0">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{tx.description}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(tx.date), 'dd/MM/yyyy', { locale: ptBR })} - <strong className="text-rose-600">{formatCurrency(tx.amount)}</strong>
                          </p>
                        </div>
                        <div className="flex flex-col sm:flex-row items-center gap-2 w-full xl:w-auto shrink-0">
                          <Select value={getOriginValue(tx)} onValueChange={(val) => handleEdit(tx.id, 'origin', val)}>
                            <SelectTrigger className="w-full sm:w-[200px]">
                              <SelectValue placeholder="Origem (Conta/Cartão)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sem Origem</SelectItem>
                              <SelectGroup>
                                <SelectLabel>Contas</SelectLabel>
                                {accounts.map(a => <SelectItem key={`acc_${a.id}`} value={`account_${a.id}`}>{a.name}</SelectItem>)}
                              </SelectGroup>
                              <SelectGroup>
                                <SelectLabel>Cartões</SelectLabel>
                                {cards.map(c => <SelectItem key={`card_${c.id}`} value={`card_${c.id}`}>{c.name}</SelectItem>)}
                              </SelectGroup>
                            </SelectContent>
                          </Select>

                          <Select value={getLinkValue(tx, 'payable')} onValueChange={(val) => handleLinkChange(tx, 'payable', val)}>
                            <SelectTrigger className="w-full sm:w-[350px]">
                              <SelectValue placeholder="Vincular a Pagar..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Não vinculado</SelectItem>
                              {tx.payable_id && <SelectItem value="remove" className="text-red-500 font-medium">Remover ligação</SelectItem>}
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
                      <div key={tx.id} className="flex flex-col xl:flex-row items-start xl:items-center gap-3 pt-3 first:pt-0">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{tx.description}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(tx.date), 'dd/MM/yyyy', { locale: ptBR })} - <strong className="text-emerald-600">{formatCurrency(tx.amount)}</strong>
                          </p>
                        </div>
                        <div className="flex flex-col sm:flex-row items-center gap-2 w-full xl:w-auto shrink-0">
                          <Select value={getOriginValue(tx)} onValueChange={(val) => handleEdit(tx.id, 'origin', val)}>
                            <SelectTrigger className="w-full sm:w-[200px]">
                              <SelectValue placeholder="Destino (Conta)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sem Destino</SelectItem>
                              <SelectGroup>
                                <SelectLabel>Contas</SelectLabel>
                                {accounts.map(a => <SelectItem key={`acc_${a.id}`} value={`account_${a.id}`}>{a.name}</SelectItem>)}
                              </SelectGroup>
                            </SelectContent>
                          </Select>

                          <Select value={getLinkValue(tx, 'receivable')} onValueChange={(val) => handleLinkChange(tx, 'receivable', val)}>
                            <SelectTrigger className="w-full sm:w-[350px]">
                              <SelectValue placeholder="Vincular a Receber..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Não vinculado</SelectItem>
                              {tx.receivable_id && <SelectItem value="remove" className="text-red-500 font-medium">Remover ligação</SelectItem>}
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