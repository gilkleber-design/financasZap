// ... (mantenha os imports e constantes de cores/labels anteriores)

export default function Payables() {
  // ... (mantenha os estados de abas, filtros e datas anteriores)

  const queryClient = useQueryClient();

  // 1. QUERY DE PAYABLES
  const { data: payables = [] } = useQuery({
    queryKey: ['payables'],
    queryFn: () => base44.entities.Payable.list('-due_date', 500),
  });

  // 2. MUTATION PARA ESTORNAR PAGAMENTO (O que faz o status "Paga" sumir)
  const undoPaymentMutation = useMutation({
    mutationFn: async (p) => {
      if (p.transaction_id) {
        await base44.entities.Transaction.delete(p.transaction_id);
      }
      return await base44.entities.Payable.update(p.id, { 
        status: 'pending', 
        transaction_id: null 
      });
    },
    onSuccess: () => {
      // O PULO DO GATO: Invalida TUDO. 
      // Isso força a tela de Invoices a perceber que o Payable não está mais pago.
      queryClient.invalidateQueries(); 
      toast.success('Pagamento estornado. A fatura foi reaberta!');
    },
    onError: () => toast.error('Erro ao estornar pagamento.')
  });

  // 3. MUTATION PARA DELETAR O LANÇAMENTO DA FATURA
  const deleteMutation = useMutation({
    mutationFn: async (p) => {
      return await base44.entities.Payable.delete(p.id);
    },
    onSuccess: () => {
      // Ao deletar o payable da fatura, a tela de Invoice precisa saber 
      // para voltar a mostrar o botão "Fechar Fatura" ou "Pagar".
      queryClient.invalidateQueries();
      setDeletingPayable(null);
      toast.success('Lançamento removido.');
    },
  });

  // ... (resto da lógica de filtragem que já discutimos)

  return (
    <div className="p-6 space-y-6 font-sora text-slate-800">
      {/* ... Header e Filtros ... */}

      <Card className="border-0 shadow-sm overflow-hidden bg-white">
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {filtered.map(p => {
              const status = getStatus(p);
              return (
                <div key={p.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50/50 transition-colors">
                  {/* ... Colunas de descrição e valores ... */}
                  
                  <div className="flex items-center gap-1 border-l pl-2">
                    {status === 'paid' ? (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-amber-500 hover:bg-amber-50"
                        onClick={() => undoPaymentMutation.mutate(p)}
                        disabled={undoPaymentMutation.isPending}
                      >
                        <Undo2 className={`w-4 h-4 ${undoPaymentMutation.isPending ? 'animate-spin' : ''}`} />
                      </Button>
                    ) : (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-emerald-600"
                        onClick={() => setConfirmingPayable(p)}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </Button>
                    )}

                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-slate-300 hover:text-red-600"
                      onClick={() => setDeletingPayable(p)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Alerta de Confirmação de Deleção */}
      <AlertDialog open={!!deletingPayable} onOpenChange={() => setDeletingPayable(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso excluirá o registro de pagamento. Se for uma fatura, ela voltará ao estado anterior na tela de cartões.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button 
              variant="destructive" 
              onClick={() => deleteMutation.mutate(deletingPayable)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Removendo...' : 'Confirmar Remoção'}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* ... Outros modais (Edit, Confirm, Form) ... */}
    </div>
  );
}