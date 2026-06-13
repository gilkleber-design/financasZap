import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 403 });

        // Tenta todas as estratégias para resolver family_id
        const candidate1 = user.family_id;
        const candidate2 = user.data?.family_id;
        const candidate3 = user.id;

        // Testa cada candidato para ver qual tem dados
        const testFamilyId = async (fid) => {
            if (!fid) return 0;
            const r = await base44.asServiceRole.entities.Transaction.filter({ family_id: fid }, '-created_date', 5);
            return r.length;
        };

        const c1count = await testFamilyId(candidate1);
        const c2count = candidate2 && candidate2 !== candidate1 ? await testFamilyId(candidate2) : -1;
        const c3count = candidate3 !== candidate1 && candidate3 !== candidate2 ? await testFamilyId(candidate3) : -1;

        // Usa o candidato que tem dados
        const resolved_family_id = (c1count > 0 ? candidate1 : null)
            || (c2count > 0 ? candidate2 : null)
            || (c3count > 0 ? candidate3 : null)
            || candidate1 || candidate2 || candidate3;

        const allTxsCount = await base44.asServiceRole.entities.Transaction.filter({ family_id: resolved_family_id }, '-created_date', 5);
        const allPayablesCount = await base44.asServiceRole.entities.Payable.filter({ family_id: resolved_family_id }, '-created_date', 5);

        const _debug = {
            user_id: user.id,
            user_family_id: user.family_id,
            user_data_family_id: user.data?.family_id,
            candidates: { c1: { id: candidate1, count: c1count }, c2: { id: candidate2, count: c2count }, c3: { id: candidate3, count: c3count } },
            resolved_family_id,
            all_transactions_sample_count: allTxsCount.length,
            all_payables_sample_count: allPayablesCount.length,
            tx_sample: allTxsCount.slice(0, 2).map(t => ({ id: t.id, date: t.date, family_id: t.family_id })),
        };

        // Usa $lt do próximo mês em vez de $lte do dia 31 (fix para timestamps ISO)
        const startMay = '2026-05-01';
        const startJun = '2026-06-01';

        const txsMay = await base44.asServiceRole.entities.Transaction.filter({
            family_id: resolved_family_id,
            type: 'expense',
            date: { $gte: startMay, $lt: startJun }
        }, '-amount', 5000);

        const payablesAll = await base44.asServiceRole.entities.Payable.filter({ family_id: resolved_family_id }, '-amount', 5000);
        const payablesMap = {};
        payablesAll.forEach(p => payablesMap[p.id] = p);

        // Fix: usa $lt para comparação de strings de data também
        const payablesMay = payablesAll.filter(p => {
            const ref = p.competencia || p.due_date;
            return ref >= startMay && ref < startJun;
        });

        const top5Txs = txsMay.slice(0, 5).map(t => ({ id: t.id, desc: t.description, amount: t.amount, date: t.date, p_id: t.payable_id }));

        const payablesMayPaid = payablesMay.filter(p => p.status === 'paid');
        const top5PayablesPaid = payablesMayPaid.slice(0, 5).map(p => ({ id: p.id, desc: p.description, amount: p.amount, ref: p.competencia || p.due_date }));

        const crossingTxs = txsMay.filter(t => {
            if (!t.payable_id) return false;
            const p = payablesMap[t.payable_id];
            if (!p) return false;
            const pRef = p.competencia || p.due_date;
            return pRef < startMay || pRef >= startJun;
        }).map(t => {
            const p = payablesMap[t.payable_id];
            return { amount: t.amount, tx_desc: t.description, tx_date: t.date, payable_desc: p.description, payable_ref: p.competencia || p.due_date };
        });

        const txByPayable = {};
        txsMay.forEach(t => {
            if (t.payable_id) {
                if (!txByPayable[t.payable_id]) txByPayable[t.payable_id] = [];
                txByPayable[t.payable_id].push(t);
            }
        });
        const duplicates = Object.entries(txByPayable).filter(([k, arr]) => arr.length > 1).map(([k, arr]) => ({
            payable_id: k,
            payable_desc: payablesMap[k]?.description,
            count: arr.length,
            total_amount: arr.reduce((s, t) => s + t.amount, 0),
            tx_dates: arr.map(t => t.date)
        }));

        const invoicesMay = payablesMay.filter(p => p.is_card_invoice_payable);
        const invoiceItemsSum = payablesMay.filter(p => p.card_invoice_id).reduce((s, p) => s + (p.amount || 0), 0);

        const orphansMay = txsMay.filter(t => !t.payable_id || !payablesMap[t.payable_id]);
        const top10Orphans = orphansMay.slice(0, 10).map(t => ({ id: t.id, desc: t.description, amount: t.amount, date: t.date }));

        const payablesMayPending = payablesMay.filter(p => p.status !== 'paid');
        const top5PayablesPending = payablesMayPending.slice(0, 5).map(p => ({ id: p.id, desc: p.description, amount: p.amount, ref: p.competencia || p.due_date }));

        const a_txsPaidInMonth = txsMay.filter(t => {
            if (!t.payable_id) return false;
            const p = payablesMap[t.payable_id];
            if (!p) return false;
            const pRef = p.competencia || p.due_date;
            return pRef >= startMay && pRef < startJun;
        }).reduce((s, t) => s + (t.amount || 0), 0);

        const b_txsPaidOtherMonth = crossingTxs.reduce((s, c) => s + c.amount, 0);
        const c_orphansSum = orphansMay.reduce((s, t) => s + (t.amount || 0), 0);
        const d_payablesPaidSum = payablesMayPaid.reduce((s, p) => s + (p.amount || 0), 0);

        return Response.json({
            _debug,
            1: { title: "1. Transactions Expense (date=Mai/2026)", count: txsMay.length, sum: txsMay.reduce((s, t) => s + (t.amount || 0), 0), top5: top5Txs },
            2: { title: "2. Payables (ref=Mai/2026, status=paid)", count: payablesMayPaid.length, sum: d_payablesPaidSum, top5: top5PayablesPaid },
            3: { title: "3. Cruzamento (Tx Mai -> Payable Outro Mês)", count: crossingTxs.length, sum: b_txsPaidOtherMonth, items: crossingTxs },
            4: { title: "4. Duplicidades (Múltiplas Txs -> Mesmo Payable)", count: duplicates.length, sum_of_txs: duplicates.reduce((s,d)=>s+d.total_amount,0), items: duplicates },
            5: { title: "5. Cartões", invoices_count: invoicesMay.length, invoices_sum: invoicesMay.reduce((s,p)=>s+p.amount,0), items_sum: invoiceItemsSum },
            6: { title: "6. Transactions Órfãs (sem payable_id)", count: orphansMay.length, sum: c_orphansSum, top10: top10Orphans },
            7: { title: "7. Payables Pendentes em Maio", count: payablesMayPending.length, sum: payablesMayPending.reduce((s, p) => s + (p.amount || 0), 0), top5: top5PayablesPending },
            8: {
                title: "8. Soma Detalhada (As 4 categorias)",
                a_txs_pagas_no_mes: a_txsPaidInMonth,
                b_txs_pagas_outro_mes: b_txsPaidOtherMonth,
                c_despesas_avulsas_orfans: c_orphansSum,
                d_payables_pagos_maio: d_payablesPaidSum,
                legacy_expect: a_txsPaidInMonth + b_txsPaidOtherMonth + c_orphansSum,
                novo_expect: a_txsPaidInMonth + c_orphansSum + d_payablesPaidSum
            }
        });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
});