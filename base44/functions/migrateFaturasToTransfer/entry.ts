import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 403 });

        const body = await req.json().catch(() => ({}));
        const execute = body.execute === true;

        const family_id = user.data?.family_id || user.family_id;
        if (!family_id) return Response.json({ error: 'family_id não encontrado no usuário' }, { status: 400 });

        // 1. Busca todas as categorias da família do usuário (user-scoped, RLS ok)
        const allCats = await base44.entities.Category.filter({ family_id }, 'name', 500);

        // Categorias fonte (antigas) — slugs que devem virar "fatura"
        const SOURCE_SLUGS = ['faturas_de_cartao', 'passivos_de_transicao'];
        const sourceCats = allCats.filter(c => SOURCE_SLUGS.includes(c.slug));
        const sourceIds = sourceCats.map(c => c.id);
        const sourceSlugs = sourceCats.map(c => c.slug);

        // Categoria destino "fatura" da família do usuário
        const faturaCat = allCats.find(c => c.slug === 'fatura');

        if (!faturaCat) {
            return Response.json({
                error: 'Categoria "fatura" não encontrada na família do usuário.',
                all_slugs: allCats.map(c => c.slug),
                family_id
            }, { status: 400 });
        }

        // 2. Busca transactions de despesa do usuário (user-scoped, RLS ok)
        const allTxs = await base44.entities.Transaction.filter({ type: 'expense' }, '-date', 5000);

        // Filtra as que usam as categorias fonte (por id ou slug)
        const toMigrate = allTxs.filter(t =>
            sourceIds.includes(t.category_id) ||
            sourceSlugs.includes(t.category)
        );

        if (!execute) {
            return Response.json({
                mode: 'preview',
                family_id,
                fatura_cat: { id: faturaCat.id, name: faturaCat.name, slug: faturaCat.slug, type: faturaCat.type },
                source_cats: sourceCats.map(c => ({ id: c.id, slug: c.slug, name: c.name })),
                to_update_count: toMigrate.length,
                sample: toMigrate.slice(0, 10).map(t => ({
                    id: t.id, date: t.date, description: t.description,
                    amount: t.amount, category: t.category, category_id: t.category_id
                }))
            });
        }

        // 3. Executa atualização (user-scoped, transactions pertencem ao usuário)
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
            family_id,
            total_attempted: toMigrate.length,
            updated,
            errors_count: errors.length,
            errors: errors.slice(0, 10)
        });

    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
});