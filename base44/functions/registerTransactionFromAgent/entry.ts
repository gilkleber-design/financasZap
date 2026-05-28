import { createClientFromRequest } from 'npm:@base44/sdk@0.8.29';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = await req.json();
        const {
            description, amount, type, date, origin_id, origin_type,
            category, category_id, conciliate_id, notes
        } = payload;

        if (!description || !amount || !type || !origin_id || !origin_type) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const isAccount = origin_type === 'account';
        const isCard = origin_type === 'card';
        const safeType = type === 'receipt' ? 'income' : type;
        const actualAmount = Number(amount);

        // Helper para desestruturar entidades do Base44 que vêm no formato { id, data: {...} }
        const unwrap = (item) => item?.data ? { id: item.id, ...item.data } : (item || null);

        // 1. Definição inicial da categoria
        let resolvedCategory = category === 'plantoes_pj' ? 'plantoes' : (category || undefined);
        let resolvedCategoryId = category_id || undefined;
        let resolvedCategoryRecord = null;

        // 2. Busca inicial de categoria
        if (resolvedCategory || resolvedCategoryId) {
            const filter = resolvedCategory ? { slug: resolvedCategory } : { id: resolvedCategoryId };
            const results = await base44.entities.Category.filter(filter);
            resolvedCategoryRecord = unwrap(results?.[0]);
            if (resolvedCategoryRecord) {
                resolvedCategory = resolvedCategoryRecord.slug;
                resolvedCategoryId = resolvedCategoryRecord.id;
            }
        }

        // 3. Busca e vinculação de registro para conciliação
        let predictedAmount = null;
        let conciliationRecord = null;

        if (conciliate_id) {
            const service = safeType === 'income' ? base44.entities.Receivable : base44.entities.Payable;
            const recs = await service.filter({ id: conciliate_id });
            conciliationRecord = unwrap(recs?.[0]);

            if (conciliationRecord) {
                predictedAmount = Number(
                    safeType === 'income' && conciliationRecord.net_amount !== undefined
                        ? conciliationRecord.net_amount
                        : conciliationRecord.amount
                );

                // Herança de categoria caso não tenha vindo no payload
                if (!resolvedCategoryRecord && (conciliationRecord.category || conciliationRecord.category_id)) {
                    const catId = conciliationRecord.category_id;
                    const catSlug = conciliationRecord.category === 'plantoes_pj' ? 'plantoes' : conciliationRecord.category;
                    
                    // Assume imediatamente a categoria do registro conciliado (fallback seguro)
                    resolvedCategory = catSlug || resolvedCategory;
                    resolvedCategoryId = catId || resolvedCategoryId;
                    
                    const filter = catId ? { id: catId } : { slug: catSlug };
                    const results = await base44.entities.Category.filter(filter);
                    resolvedCategoryRecord = unwrap(results?.[0]);
                    
                    if (resolvedCategoryRecord) {
                        resolvedCategory = resolvedCategoryRecord.slug || resolvedCategory;
                        resolvedCategoryId = resolvedCategoryRecord.id || resolvedCategoryId;
                    }
                }
            }
        }

        // 4. Fallback final para legado 'plantoes'
        if (!resolvedCategoryRecord && resolvedCategory === 'plantoes') {
            const legacy = await base44.entities.Category.filter({ slug: 'plantoes_pj' });
            resolvedCategoryRecord = unwrap(legacy?.[0]);
            if (resolvedCategoryRecord) {
                resolvedCategoryId = resolvedCategoryRecord.id;
            }
        }

        // 5. Criação da transação
        const txData = {
            description: conciliationRecord?.description || description,
            amount: actualAmount,
            net_amount: actualAmount,
            type: safeType,
            category: resolvedCategory,
            category_id: resolvedCategoryId,
            date: date || new Date().toISOString().split('T')[0],
            source: 'whatsapp_text',
            account_id: isAccount ? origin_id : undefined,
            card_id: isCard ? origin_id : undefined,
            reconciled: !!conciliate_id,
            status: conciliate_id ? 'conciliated' : 'registered',
            notes: notes || 'Gerado via Assistente',
            ...(conciliate_id && safeType === 'income' && { receivable_id: conciliate_id }),
            ...(conciliate_id && safeType !== 'income' && { payable_id: conciliate_id }),
        };

        const tx = await base44.entities.Transaction.create(txData);

        // 6. Atualização do registro conciliado
        if (conciliate_id && conciliationRecord) {
            const amountChanged = predictedAmount !== null && predictedAmount !== actualAmount;
            if (safeType === 'income') {
                await base44.entities.Receivable.update(conciliate_id, {
                    status: 'received',
                    transaction_id: tx.id,
                    ...(amountChanged && { net_amount: actualAmount, amount: actualAmount }),
                });
            } else {
                await base44.entities.Payable.update(conciliate_id, {
                    status: conciliationRecord.origin_type === 'card' ? 'conciliated' : 'paid',
                    transaction_id: tx.id,
                    ...(amountChanged && { amount: actualAmount }),
                });
            }
        }

        // 7. Resposta de contexto
        const originList = isAccount
            ? await base44.entities.Account.filter({ id: origin_id })
            : await base44.entities.Card.filter({ id: origin_id });
        const originRecord = unwrap(originList?.[0]);

        return Response.json({
            success: true,
            transaction: tx,
            summary_context: {
                category_slug: resolvedCategoryRecord?.slug || resolvedCategory || null,
                category_name: resolvedCategoryRecord?.name || null,
                origin_name: originRecord?.name || originRecord?.holder_name || null,
                institution_name: originRecord?.bank || null,
                event_date: tx.date,
                effective_date: tx.date,
                amount: tx.amount,
                description: tx.description,
                status: tx.status,
                predicted_amount: predictedAmount,
                amount_updated: predictedAmount !== null && predictedAmount !== actualAmount,
            }
        });

    } catch (error) {
        console.error("Error registering transaction:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});