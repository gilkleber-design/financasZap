import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { month, year } = body;

        const monthPrefix = `${year}-${month.toString().padStart(2, '0')}`;
        const startDate = `${monthPrefix}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${monthPrefix}-${lastDay.toString().padStart(2, '0')}`;

        const shifts = await base44.entities.Shift.filter({
            date: { $gte: startDate, $lte: endDate },
        });

        // Filter out avista
        const closableShifts = shifts.filter(s => !s.is_avista && s.status !== 'passed' && s.status !== 'cancelled' && !s.receivable_id);
        
        let shiftTotal = closableShifts.reduce((acc, s) => acc + (Number(s.valor) || 0) + (Number(s.valor_producao) || 0), 0);

        const recurringIncomes = await base44.entities.RecurringIncome.filter({ active: true });
        const sources = await base44.entities.IncomeSource.list();
        const hospitals = await base44.entities.Hospital.list();

        let shiftNetTotal = 0;
        closableShifts.forEach(s => {
            const h = hospitals.find(h => h.id === s.hospital_id);
            const source = sources.find(src => src.id === h?.income_source_id);
            const taxRate = Number(source?.default_tax_rate || 0);
            const gross = (Number(s.valor) || 0) + (Number(s.valor_producao) || 0);
            shiftNetTotal += taxRate > 0 ? gross * (1 - taxRate / 100) : gross;
        });

        const suggestedIncomes = recurringIncomes.map(ri => {
            let suggestedAmount = ri.default_amount;
            if (ri.lock_amount) {
                suggestedAmount = ri.default_amount;
            } else if (ri.remember_last && ri.last_amount !== undefined && ri.last_amount !== null) {
                suggestedAmount = ri.last_amount;
            }

            const source = sources.find(s => s.id === ri.income_source_id);
            const taxRate = Number(source?.default_tax_rate || 0);
            const netAmount = taxRate > 0 ? suggestedAmount * (1 - taxRate / 100) : suggestedAmount;

            return {
                ...ri,
                suggested_amount: suggestedAmount,
                net_amount: netAmount,
                tax_rate: taxRate
            };
        });

        const incomesNetTotal = suggestedIncomes.reduce((acc, b) => acc + (b.pre_check ? b.net_amount : 0), 0);

        return Response.json({
            shift_count: closableShifts.length,
            shift_total: shiftTotal,
            shift_net_total: shiftNetTotal,
            recurring_incomes: suggestedIncomes,
            total_expected: shiftNetTotal + incomesNetTotal
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});