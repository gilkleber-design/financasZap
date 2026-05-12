import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Buscar todas as categorias
    const categories = await base44.entities.Category.list('name', 100);
    
    // Encontrar IDs das subcategorias
    const subcatMap = {};
    categories.forEach(c => {
      if (c.slug === 'salario_domestica') {
        subcatMap['salario'] = c.id;
      }
      if (c.slug === 'encargos_domestica') {
        subcatMap['encargos_sociais'] = c.id;
      }
    });

    console.log('Subcategory mapping:', subcatMap);

    // Buscar todos os payables
    const payables = await base44.entities.Payable.list('-due_date', 1000);

    // Filtrar aqueles que precisam ser migrados
    const toMigrate = payables.filter(p => 
      !p.category_id && (p.category === 'salario' || p.category === 'encargos_sociais')
    );

    console.log('Found payables to migrate:', toMigrate.length);

    // Atualizar cada um
    const results = [];
    for (const payable of toMigrate) {
      const newCategoryId = subcatMap[payable.category];
      if (newCategoryId) {
        await base44.entities.Payable.update(payable.id, {
          category_id: newCategoryId,
        });
        results.push({
          id: payable.id,
          old_category: payable.category,
          new_category_id: newCategoryId,
          status: 'migrated',
        });
      } else {
        results.push({
          id: payable.id,
          old_category: payable.category,
          status: 'skipped_no_mapping',
        });
      }
    }

    return Response.json({
      message: `Migrated ${results.filter(r => r.status === 'migrated').length} payables`,
      results,
      subcatMap,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});