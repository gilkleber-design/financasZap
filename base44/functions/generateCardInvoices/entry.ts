import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Obter family_id da automação via request body
    const { family_id, forceCardId, forceMonth } = await req.json().catch(() => ({}));

    if (!family_id) {
      return Response.json(
        { error: 'family_id is required in request body' },
        { status: 400 }
      );
    }

    const today = new Date();
    const todayDay = today.getDate();
    const todayStr = today.toISOString().slice(0, 10);

    // Busca cartões de crédito da família específica
    const cards = await base44.asServiceRole.entities.Card.list('name', 200);
    const creditCards = cards.filter(
      (c) =>
        (c.type === 'credit' || c.type === 'both') &&
        c.family_id === family_id
    );

    const results = [];

    for (const card of creditCards) {
      if (forceCardId && card.id !== forceCardId) continue;

      const closingDay = card.closing_day || 1;

      if (!forceCardId && todayDay !== closingDay) continue;

      const refMonth = forceMonth || today.toISOString().slice(0, 7) + '-01';
      const refMonthStr = refMonth.slice(0, 7);

      // Verificar se já existe fatura
      const existingInvoices = await base44.asServiceRole.entities.CardInvoice.list('month', 50);
      const alreadyExists = existingInvoices.some(
        (inv) =>
          inv.card_id === card.id &&
          inv.family_id === family_id &&
          inv.month &&
          inv.month.startsWith(refMonthStr)
      );

      if (alreadyExists) {
        results.push({
          card: card.name,
          status: 'already_exists',
          month: refMonthStr,
        });
        continue;
      }

      // Buscar Payables da família
      const allPayables = await base44.asServiceRole.entities.Payable.list('-due_date', 500);
      const familyPayables = allPayables.filter(
        (p) => p.origin_id === card.id && p.origin_type === 'card' && p.family_id === family_id
      );

      const [refYear, refMon] = refMonthStr.split('-').map(Number);
      const currentClosing = new Date(refYear, refMon - 1, closingDay);
      const prevClosing = new Date(refYear, refMon - 2, closingDay);

      const invoiceItems = familyPayables.filter((p) => {
        if (p.is_card_invoice_payable) return false;
        if (p.card_invoice_id) return false;

        const validStatus =
          p.status === 'provisioned' ||
          ((p.status === 'pending' || p.status === 'scheduled') &&
            p.payment_modality === 'card_invoice');

        if (!validStatus) return false;

        if (p.status === 'provisioned') {
          const comp = p.competencia || p.due_date;
          if (!comp) return false;
          return comp.startsWith(refMonthStr);
        }

        const dueDateStr = (p.due_date || '')
          .replace('T12:00:00', '')
          .slice(0, 10);
        if (!dueDateStr) return false;
        const dueDate = new Date(dueDateStr + 'T12:00:00');
        return dueDate > prevClosing && dueDate <= currentClosing;
      });

      if (invoiceItems.length === 0) {
        results.push({
          card: card.name,
          status: 'no_items',
          month: refMonthStr,
        });
        continue;
      }

      const totalAmount = invoiceItems.reduce((s, p) => s + (p.amount || 0), 0);

      const [year, month] = refMonthStr.split('-').map(Number);
      const closingDate = new Date(year, month - 1, closingDay);
      const closingDateStr = closingDate.toISOString().slice(0, 10);

      let dueDateStr = null;
      if (card.due_day) {
        const dueDate = new Date(year, month, card.due_day);
        dueDateStr = dueDate.toISOString().slice(0, 10);
      }

      const monthLabel = new Date(refMonthStr + '-01')
        .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
        .replace(/^\w/, (c) => c.toUpperCase());

      // Criar Payable
      const invoicePayable = await base44.asServiceRole.entities.Payable.create({
        description: `Fatura ${card.name} - ${monthLabel}`,
        amount: Math.round(totalAmount * 100) / 100,
        due_date: (dueDateStr || closingDateStr) + 'T12:00:00',
        competencia: refMonth,
        category: 'transferencia_liquidacao',
        status: 'pending',
        payment_modality: 'card_invoice',
        origin_id: card.id,
        origin_type: 'card',
        is_card_invoice_payable: true,
        notes: `Fatura ${card.name} — ${refMonthStr}`,
        family_id: family_id,
      });

      // Criar CardInvoice
      const cardInvoice = await base44.asServiceRole.entities.CardInvoice.create({
        card_id: card.id,
        month: refMonth,
        total_amount: Math.round(totalAmount * 100) / 100,
        status: 'closed',
        closing_date: closingDateStr,
        due_date: dueDateStr || closingDateStr,
        payable_id: invoicePayable.id,
        family_id: family_id,
      });

      // Vincular items à fatura
      for (const item of invoiceItems) {
        await base44.asServiceRole.entities.Payable.update(item.id, {
          card_invoice_id: cardInvoice.id,
        });
      }

      results.push({
        card: card.name,
        status: 'created',
        month: refMonthStr,
        items: invoiceItems.length,
        total: totalAmount,
        invoicePayableId: invoicePayable.id,
        cardInvoiceId: cardInvoice.id,
      });
    }

    return Response.json({ processed: results.length, results });
  } catch (error) {
    console.error('generateCardInvoices error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});