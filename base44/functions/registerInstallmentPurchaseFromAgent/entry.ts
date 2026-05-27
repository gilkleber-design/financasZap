import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function toDateOnly(value) {
  return String(value || '').slice(0, 10);
}

function addMonthsSafe(dateString, months) {
  const date = new Date(`${dateString}T12:00:00`);
  const originalDay = date.getDate();
  date.setMonth(date.getMonth() + months);
  if (date.getDate() !== originalDay) date.setDate(0);
  return date.toISOString().slice(0, 10);
}

function buildMonthLabel(dateString) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).replace(/^\w/, (c) => c.toUpperCase());
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function makeGroupId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const {
      description,
      total_amount,
      installment_count,
      category,
      date,
      card_id,
      notes,
      confirmed,
    } = payload;

    const cleanDescription = String(description || '').trim();
    const purchaseDate = toDateOnly(date || new Date().toISOString());
    const totalAmount = Number(total_amount);
    const installmentCount = Number(installment_count);

    if (!cleanDescription || !Number.isFinite(totalAmount) || totalAmount <= 0) {
      return Response.json({ error: 'Descrição e valor total válidos são obrigatórios' }, { status: 400 });
    }

    if (!Number.isInteger(installmentCount) || installmentCount < 2) {
      return Response.json({ error: 'Quantidade de parcelas deve ser 2 ou maior' }, { status: 400 });
    }

    if (!card_id) {
      return Response.json({ error: 'card_id é obrigatório' }, { status: 400 });
    }

    const card = await base44.entities.Card.get(card_id);
    if (!card) {
      return Response.json({ error: 'Cartão não encontrado' }, { status: 404 });
    }

    const perInstallmentRaw = Math.round((totalAmount / installmentCount) * 100) / 100;
    const roundedTotal = Math.round(totalAmount * 100);
    const baseInstallmentCents = Math.floor(roundedTotal / installmentCount);
    const remainder = roundedTotal - (baseInstallmentCents * installmentCount);

    const installments = Array.from({ length: installmentCount }, (_, index) => {
      const cents = baseInstallmentCents + (index < remainder ? 1 : 0);
      const amount = cents / 100;
      const dueDate = addMonthsSafe(purchaseDate, index);
      return {
        number: index + 1,
        amount,
        due_date: dueDate,
        competencia: dueDate,
        description: `${cleanDescription} (${index + 1}/${installmentCount})`,
        invoice_month_label: buildMonthLabel(dueDate),
      };
    });

    const summary = {
      description: cleanDescription,
      card_name: card.name,
      bank_name: card.bank || null,
      purchase_date: purchaseDate,
      total_amount: totalAmount,
      total_amount_formatted: formatCurrency(totalAmount),
      installment_count: installmentCount,
      average_installment_amount_formatted: formatCurrency(perInstallmentRaw),
      installments: installments.map((item) => ({
        ...item,
        amount_formatted: formatCurrency(item.amount),
      })),
      status_logic: {
        item_status: 'provisioned',
        item_status_label: 'Provisionada',
        invoice_status_when_created: 'pending',
        invoice_status_label: 'Pendente até o pagamento da fatura',
      },
      whatsapp_preview: [
        '🧾 *Resumo da compra parcelada*',
        '',
        `• Compra: ${cleanDescription}`,
        `• Cartão: ${card.name}`,
        `• Valor total: ${formatCurrency(totalAmount)}`,
        `• Parcelamento: ${installmentCount}x`,
        '',
        '*Parcelas previstas:*',
        ...installments.map((item) => `• ${item.number}/${installmentCount} — ${formatCurrency(item.amount)} — fatura de ${item.invoice_month_label}`),
        '',
        '📌 *Como vai ficar no sistema*',
        '• Cada parcela será criada como *provisioned*',
        '• Elas serão quitadas quando a fatura do cartão for paga',
        '',
        confirmed ? '✅ Confirmação recebida.' : 'Responda *sim* para confirmar.',
      ].join('\n'),
    };

    if (!confirmed) {
      return Response.json({
        success: true,
        requires_confirmation: true,
        summary,
      });
    }

    const groupId = makeGroupId();
    const createdPayables = await base44.entities.Payable.bulkCreate(
      installments.map((item) => ({
        description: item.description,
        amount: item.amount,
        due_date: item.due_date,
        competencia: item.competencia,
        category: category || undefined,
        origin_id: card_id,
        origin_type: 'card',
        payment_modality: 'manual',
        status: 'provisioned',
        recurrent: false,
        installment_total_amount: totalAmount,
        installment_count: installmentCount,
        installment_number: item.number,
        installment_group_id: groupId,
        notes: notes || 'Gerado via Assistente — compra parcelada no cartão',
      }))
    );

    return Response.json({
      success: true,
      requires_confirmation: false,
      installment_group_id: groupId,
      payables_created: createdPayables.length,
      summary_context: {
        description: cleanDescription,
        card_name: card.name,
        institution_name: card.bank || null,
        purchase_date: purchaseDate,
        total_amount: totalAmount,
        installment_count: installmentCount,
        status: 'provisioned',
      },
      summary,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});