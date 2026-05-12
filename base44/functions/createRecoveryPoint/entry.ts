import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Acesso negado: Admin required' }, { status: 403 });
    }

    // Captura estado atual
    const categories = await base44.entities.Category.list();
    const payables = await base44.entities.Payable.list();

    const recoveryPoint = {
      timestamp: new Date().toISOString(),
      created_by: user.email,
      snapshot: {
        categories_count: categories.length,
        payables_count: payables.length,
        categories_sample: categories.slice(0, 10),
        category_hierarchy: buildHierarchy(categories),
        payables_category_distribution: analyzePayablesCategories(payables, categories),
      },
      full_data: {
        categories,
        payables,
      },
    };

    // Log estruturado
    console.log(`[RECOVERY POINT] ${new Date().toISOString()} - Categories: ${categories.length}, Payables: ${payables.length}`);
    
    return Response.json({
      status: 'success',
      message: 'Ponto de recuperação criado com sucesso',
      snapshot: recoveryPoint,
    });
  } catch (error) {
    console.error('Erro ao criar recovery point:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function buildHierarchy(categories) {
  const roots = categories.filter(c => !c.parent_id);
  return roots.map(root => ({
    id: root.id,
    name: root.name,
    slug: root.slug,
    children: categories
      .filter(c => c.parent_id === root.id)
      .map(child => ({ id: child.id, name: child.name, slug: child.slug })),
  }));
}

function analyzePayablesCategories(payables, categories) {
  const catMap = {};
  categories.forEach(c => {
    catMap[c.id] = c.slug || c.name;
  });

  const dist = {};
  payables.forEach(p => {
    const catKey = p.category_id ? catMap[p.category_id] : p.category || 'unknown';
    dist[catKey] = (dist[catKey] || 0) + 1;
  });

  return dist;
}