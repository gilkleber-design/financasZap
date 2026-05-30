import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const payload = await req.json();
        const { member_id } = payload;
        
        const familyId = user.family_id || user.id;
        if (familyId !== user.id) {
            return Response.json({ error: 'Somente o titular pode remover membros' }, { status: 403 });
        }
        if (member_id === user.id) {
             return Response.json({ error: 'Você não pode se remover' }, { status: 400 });
        }

        const member = await base44.asServiceRole.entities.User.get(member_id);
        if ((member.family_id || member.id) !== familyId) {
             return Response.json({ error: 'Usuário não pertence à sua família' }, { status: 400 });
        }

        await base44.asServiceRole.entities.User.update(member_id, { family_id: member_id });

        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});