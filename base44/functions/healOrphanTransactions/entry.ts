import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    console.log('Iniciando auditoria de regra pétrea (Conta/Cartão obrigatórios)...');

    // Busca as últimas 1000 transações
    const transactions = await base44.asServiceRole.entities.Transaction.list('-date', 1000);
    
    // Transação inválida = não tem account_id E não tem card_id
    const invalidTransactions = transactions.filter((t) => !t.account_id && !t.card_id);

    console.log(`Encontradas ${invalidTransactions.length} transações violando a regra pétrea.`);

    let fixCount = 0;
    const fixed = [];

    // Tenta atribuir a uma "Conta Genérica" ou pelo menos alerta nos "notes"
    for (const row of invalidTransactions) {
      // Como não sabemos de onde saiu, vamos adicionar uma anotação severa
      // No mundo real, você poderia forçar para uma "Conta de Ajuste" aqui.
      const newNotes = row.notes ? `${row.notes} | [ALERTA] Violação de Regra Pétrea: Sem Origem` : '[ALERTA] Violação de Regra Pétrea: Sem Origem';
      
      await base44.asServiceRole.entities.Transaction.update(row.id, {
        notes: newNotes
      });

      fixCount++;
      fixed.push({
        transaction_id: row.id,
        description: row.description,
        amount: row.amount,
        date: row.date,
      });
      console.log(`[!] Alerta registrado em: ${row.description} - R$ ${row.amount}`);
    }

    return Response.json({
      message: `Auditoria concluída. ${fixCount} transações sem origem detectadas e alertadas.`,
      flagged: fixed,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});