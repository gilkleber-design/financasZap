import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    const allTransactions = await base44.entities.Transaction.list('date', 1000);
    
    // Group incomes to see duplicates or massive values
    const incomeGroups = {};

    allTransactions.forEach(t => {
      if (t.status !== 'ignored') {
         if (t.type === 'income') {
           if (!incomeGroups[t.description]) incomeGroups[t.description] = { desc: t.description, count: 0, amount: 0, ids: [] };
           incomeGroups[t.description].count++;
           incomeGroups[t.description].amount += t.amount;
           incomeGroups[t.description].ids.push(t.id);
         }
      }
    });

    return Response.json({ 
      incomes: Object.values(incomeGroups).sort((a,b) => b.amount - a.amount).slice(0, 20)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});