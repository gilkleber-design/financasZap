import { createClientFromRequest } from 'npm:@base44/sdk@0.8.29';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const { type } = payload;

    const allCategories = await base44.entities.Category.list('', 500);
    const activeCategories = allCategories.filter((c) => c.active !== false);

    const filtered = type
      ? activeCategories.filter((c) => c.type === type)
      : activeCategories;

    const sorted = filtered.sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')
    );

    return Response.json({
      success: true,
      type: type || null,
      categories: sorted.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        type: c.type,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});