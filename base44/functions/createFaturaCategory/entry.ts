import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 403 });

        // Busca categorias do usuário via RLS (family_id vem automaticamente)
        const myCats = await base44.entities.Category.list('name', 500);

        const existing = myCats.find(c => c.slug === 'fatura');
        if (existing) {
            return Response.json({
                created: false,
                message: 'Categoria "fatura" já existe na sua família.',
                category: existing
            });
        }

        const created = await base44.entities.Category.create({
            name: 'Fatura',
            slug: 'fatura',
            type: 'transfer',
            color: '#475569',
            active: true
        });

        return Response.json({
            created: true,
            message: 'Categoria "fatura" criada com sucesso.',
            category: created
        });

    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
});