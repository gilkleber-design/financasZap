import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { category_id, limit, month, year } = await req.json();
        
        if (!category_id || limit === undefined) {
             return Response.json({ error: 'category_id and limit are required' }, { status: 400 });
        }

        const targetMonth = month || new Date().getMonth() + 1;
        const targetYear = year || new Date().getFullYear();

        const budgets = await base44.entities.Budget.filter({
            category_id: category_id,
            month: targetMonth,
            year: targetYear
        });

        let updatedBudget;
        if (budgets.length > 0) {
            updatedBudget = await base44.entities.Budget.update(budgets[0].id, {
                amount: Number(limit)
            });
        } else {
            updatedBudget = await base44.entities.Budget.create({
                category_id: category_id,
                month: targetMonth,
                year: targetYear,
                amount: Number(limit)
            });
        }

        return Response.json({
            category_id,
            new_limit: Number(limit),
            status: 'ok',
            budget: updatedBudget
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});