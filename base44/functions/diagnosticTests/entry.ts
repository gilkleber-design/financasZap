import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 403 });

        const TARGET_FAMILY_ID = "69e8f3a2e9ed0f3c08b392f9";
        const TX_ID = "6a0316780797dba2a55d2f3c";
        const FATURA_CAT_ID = "6a0a6bf9198e607e52355bc8";
        const ORIGINAL_CAT_ID = "6a0e5b3daf849f11b8cdf606";

        // === PERGUNTA 1 ===
        const allCats = await base44.asServiceRole.entities.Category.list('name', 500);
        const p1 = {
            total: allCats.length,
            family_ids_unique: [...new Set(allCats.map(c => c.family_id))],
            fatura_entry: allCats.find(c => c.slug === 'fatura') || null,
            sample_3: allCats.slice(0, 3)
        };

        // === PERGUNTA 2 ===
        const filtered = await base44.asServiceRole.entities.Category.filter(
            { family_id: TARGET_FAMILY_ID }, 'name', 500
        );
        const p2 = {
            total: filtered.length,
            slugs: filtered.map(c => c.slug)
        };

        // === PERGUNTA 3 ===
        let p3;
        try {
            const updated = await base44.asServiceRole.entities.Transaction.update(
                TX_ID,
                { category_id: FATURA_CAT_ID, category: 'fatura' }
            );
            // Reverte imediatamente
            await base44.asServiceRole.entities.Transaction.update(TX_ID, {
                category_id: ORIGINAL_CAT_ID,
                category: 'passivos_de_transicao'
            });
            p3 = { success: true, updated_fields: { category_id: updated.category_id, category: updated.category } };
        } catch (err) {
            p3 = { success: false, error: err.message };
        }

        // === PERGUNTA 4 ===
        const userCats = allCats.filter(c => c.family_id === TARGET_FAMILY_ID);
        const slugCount = {};
        userCats.forEach(c => { slugCount[c.slug] = (slugCount[c.slug] || 0) + 1; });
        const duplicates = Object.entries(slugCount).filter(([, n]) => n > 1);
        const p4 = { duplicates };

        // === PERGUNTA 5 ===
        const allFatura = allCats.filter(c => c.slug === 'fatura');
        const p5 = { allFatura };

        return Response.json({ p1, p2, p3, p4, p5 });

    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
});