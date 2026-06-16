import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

        const body = await req.json().catch(() => ({}));
        const { member_id } = body;
        if (!member_id) return Response.json({ error: 'member_id obrigatório' }, { status: 400 });

        const myFamilyId = user.family_id || user.id;

        // Atualiza o family_id do membro para o da família do admin
        await base44.asServiceRole.entities.User.update(member_id, { family_id: myFamilyId });

        return Response.json({ success: true, member_id, family_id: myFamilyId });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
});