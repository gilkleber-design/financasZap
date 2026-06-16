import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const payload = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

        // Busca todos os payables da família
        const payables = await base44.entities.Payable.list('-due_date', 5000);

        const divergentes = [];
        const semCompetencia = [];

        for (const p of payables) {
            if (!p.competencia) {
                semCompetencia.push({
                    id: p.id,
                    description: p.description,
                    due_date: p.due_date,
                    amount: p.amount,
                    status: p.status,
                });
                continue;
            }

            const mesCompetencia = String(p.competencia).slice(0, 7);
            const mesVencimento = p.due_date ? String(p.due_date).slice(0, 7) : null;

            if (mesVencimento && mesCompetencia !== mesVencimento) {
                divergentes.push({
                    id: p.id,
                    description: p.description,
                    amount: p.amount,
                    status: p.status,
                    competencia: p.competencia,
                    due_date: p.due_date,
                    mes_competencia: mesCompetencia,
                    mes_vencimento: mesVencimento,
                    diff: `${mesCompetencia} → ${mesVencimento}`,
                    category_id: p.category_id,
                    category: p.category,
                });
            }
        }

        // Agrupar divergentes por par de meses
        const porPar = {};
        for (const p of divergentes) {
            const key = p.diff;
            if (!porPar[key]) porPar[key] = { count: 0, total: 0, items: [] };
            porPar[key].count++;
            porPar[key].total += (p.amount || 0);
            porPar[key].items.push(p);
        }

        const resumoPorPar = Object.entries(porPar)
            .map(([par, data]) => ({ par, count: data.count, total: data.total, items: data.items }))
            .sort((a, b) => b.count - a.count);

        // Modo fix: corrige competencia = due_date para todos os divergentes
        const { fix } = payload || {};
        if (fix) {
            const fixed = [];
            for (const p of divergentes) {
                const newCompetencia = p.due_date.slice(0, 10);
                await base44.entities.Payable.update(p.id, { competencia: newCompetencia });
                fixed.push({ id: p.id, description: p.description, old: p.mes_competencia, new: newCompetencia.slice(0, 7) });
            }
            return Response.json({ fixed_count: fixed.length, fixed });
        }

        return Response.json({
            total_payables: payables.length,
            sem_competencia: semCompetencia.length,
            divergentes_count: divergentes.length,
            resumo_por_par: resumoPorPar,
            divergentes,
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});