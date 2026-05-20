import { createClientFromRequest } from 'npm:@base44/sdk@0.8.29';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (req.method !== 'POST') {
            return Response.json({ error: 'Method not allowed' }, { status: 405 });
        }

        const payload = await req.json();
        const { source_month, source_year, target_month, target_year } = payload;

        if (!source_month || !source_year || !target_month || !target_year) {
             return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // Check if target already has budgets
        const targetBudgets = await base44.entities.Budget.filter({
            month: target_month,
            year: target_year
        });

        if (targetBudgets.length > 0) {
            return Response.json({ error: 'Já existem orçamentos para o mês/ano de destino.' }, { status: 400 });
        }

        // Get source budgets
        const sourceBudgets = await base44.entities.Budget.filter({
            month: source_month,
            year: source_year
        });

        if (sourceBudgets.length === 0) {
            return Response.json({ error: 'Nenhum orçamento encontrado no mês/ano de origem.' }, { status: 404 });
        }

        // Map and prepare bulk create payload
        const newBudgets = sourceBudgets.map(b => ({
            category_id: b.category_id,
            month: target_month,
            year: target_year,
            amount: b.amount
        }));

        await base44.entities.Budget.bulkCreate(newBudgets);

        return Response.json({ success: true, count: newBudgets.length });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});