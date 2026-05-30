import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const targetFamilyId = user.family_id || user.id;

        // Busca apenas usuários que pertencem à família do requisitante, evitando carregar todos os usuários do sistema
        const familyMembers = await base44.asServiceRole.entities.User.filter({
            $or: [
                { family_id: targetFamilyId },
                { id: targetFamilyId }
            ]
        });

        const safeMembers = familyMembers.map(u => ({
            id: u.id,
            full_name: u.full_name,
            email: u.email,
            role: u.role,
            is_owner: u.id === targetFamilyId
        }));

        return Response.json({ members: safeMembers });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});