import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Buscar todas as transações de income
    const allTransactions = await base44.entities.Transaction.list('date', 1000);
    
    // Filtrar por type = income e income_source_id vazio
    const incomeWithoutSource = allTransactions.filter(t => 
      t.type === 'income' && (!t.income_source_id || t.income_source_id === '')
    );

    return Response.json({ 
      total: incomeWithoutSource.length,
      transactions: incomeWithoutSource 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});