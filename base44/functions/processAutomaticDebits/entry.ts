import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Processa débitos automáticos agendados que venceram.
 * Chamado diariamente por automação agendada.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Processa globalmente para todas as famílias, pois é um script de manutenção agendada rodando como admin
    const allPayables = await base44.asServiceRole.entities.Payable.list('-due_date', 500);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Filtra payables agendados cujo vencimento já passou
    const toProcess = allPayables.filter(p => {
      if (p.status !== 'scheduled' || p.payment_modality !== 'automatic_debit') return false;
      if (!p.due_date) return false;
      const due = new Date(p.due_date);
      due.setHours(0, 0, 0, 0);
      return due <= today;
    });

    let processed = 0;

    for (const p of toProcess) {
      // Cria lançamento de despesa
      const tx = await base44.asServiceRole.entities.Transaction.create({
        description: p.description,
        amount: p.amount,
        net_amount: p.amount,
        type: 'expense',
        category: p.category_id || p.category || 'outros',
        date: new Date().toISOString().split('T')[0],
        payable_id: p.id,
        reconciled: true,
        source: 'manual',
        notes: 'Débito automático processado automaticamente',
      });

      // Marca como pago
      await base44.asServiceRole.entities.Payable.update(p.id, {
        status: 'paid',
        transaction_id: tx.id,
      });

      processed++;
    }

    return Response.json({
      success: true,
      processed,
      message: `${processed} débitos automáticos processados`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});