import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 403 });

        const body = await req.json().catch(() => ({}));
        const execute = body.execute === true;

        // 1. Busca categorias via RLS (user-scoped, sem asServiceRole)
        const myCats = await base44.entities.Category.list('name', 500);

        const SOURCE_SLUGS = ['faturas_de_cartao', 'passivos_de_transicao'];
        const sourceCats = myCats.filter(c => SOURCE_SLUGS.includes(c.slug));
        const sourceIds = sourceCats.map(c => c.id);
        const sourceSlugsFound = sourceCats.map(c => c.slug);

        const faturaCat = myCats.find(c => c.slug === 'fatura');
        if (!faturaCat) {
            return Response.json({
                error: 'Categoria "fatura" não encontrada. Rode createFaturaCategory primeiro.',
                all_slugs: myCats.map(c => c.slug)
            }, { status: 400 });
        }

        // 2. Busca transactions via RLS (user-scoped)
        const allTxs = await base44.entities.Transaction.list('-date', 5000);

        // 3. Filtra as que usam categorias fonte (por id ou slug)
        const toMigrate = allTxs.filter(t =>
            sourceIds.includes(t.category_id) ||
            sourceSlugsFound.includes(t.category)
        );

        if (!execute) {
            return Response.json({
                mode: 'preview',
                fatura_cat: { id: faturaCat.id, name: faturaCat.name, slug: faturaCat.slug, type: faturaCat.type },
                source_cats: sourceCats.map(c => ({ id: c.id, slug: c.slug, name: c.name })),
                to_update_count: toMigrate.length,
                sample: toMigrate.slice(0, 15).map(t => ({
                    id: t.id, date: t.date, description: t.description,
                    amount: t.amount, category: t.category, category_id: t.category_id
                }))
            });
        }

        // 4. Executa atualização
        let updated = 0;
        const errors = [];
        for (const t of toMigrate) {
            try {
                await base44.entities.Transaction.update(t.id, {
                    category_id: faturaCat.id,
                    category: 'fatura'
                });
                updated++;
            } catch (err) {
                errors.push({ id: t.id, description: t.description, error: err.message });
            }
        }

        return Response.json({
            mode: 'execute',
            total_attempted: toMigrate.length,
            updated,
            errors_count: errors.length,
            errors: errors.slice(0, 10)
        });

    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
});