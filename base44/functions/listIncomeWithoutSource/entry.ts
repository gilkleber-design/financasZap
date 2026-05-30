import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // VERIFICAÇÃO OBRIGATÓRIA: Checar autenticação
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Listar apenas transações da família do usuário
    const allTransactions = await base44.entities.Transaction.list('date', 1000);

    // Filtrar por family_id + tipo income + não ignoradas
    const incomeTransactions = allTransactions.filter(
      (t) =>
        t.family_id === user.family_id &&
        t.type === 'income' &&
        t.status !== 'ignored'
    );

    // Agrupar por descrição
    const incomeGroups = {};
    incomeTransactions.forEach((t) => {
      if (!incomeGroups[t.description]) {
        incomeGroups[t.description] = {
          desc: t.description,
          count: 0,
          amount: 0,
          ids: [],
        };
      }
      incomeGroups[t.description].count++;
      incomeGroups[t.description].amount += t.amount;
      incomeGroups[t.description].ids.push(t.id);
    });

    return Response.json({
      familyId: user.family_id,
      incomes: Object.values(incomeGroups)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 20),
    });
  } catch (error) {
    console.error('listIncomeWithoutSource error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});