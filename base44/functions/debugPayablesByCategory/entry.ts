import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Buscar todos os payables
    const payables = await base44.entities.Payable.list('-due_date', 1000);
    
    // Buscar todas as categorias
    const categories = await base44.entities.Category.list('name', 100);
    
    // Agrupar payables por category_id
    const byCategoryId = {};
    const byEnumCategory = {};
    
    payables.forEach(p => {
      if (p.category_id) {
        if (!byCategoryId[p.category_id]) {
          byCategoryId[p.category_id] = [];
        }
        byCategoryId[p.category_id].push(p);
      } else {
        const cat = p.category || 'outros';
        if (!byEnumCategory[cat]) {
          byEnumCategory[cat] = [];
        }
        byEnumCategory[cat].push(p);
      }
    });

    // Criar mapa de categoria
    const catMap = {};
    categories.forEach(c => {
      catMap[c.id] = c;
    });

    // Totais por category_id
    const categoryIdSummary = Object.entries(byCategoryId).map(([catId, items]) => {
      const cat = catMap[catId];
      return {
        category_id: catId,
        category_name: cat?.name || 'Unknown',
        category_slug: cat?.slug || 'unknown',
        parent_id: cat?.parent_id || null,
        count: items.length,
        total: items.reduce((s, i) => s + (i.amount || 0), 0),
      };
    });

    // Totais por enum category
    const enumSummary = Object.entries(byEnumCategory).map(([enumCat, items]) => ({
      enum_category: enumCat,
      count: items.length,
      total: items.reduce((s, i) => s + (i.amount || 0), 0),
    }));

    return Response.json({
      by_category_id: categoryIdSummary,
      by_enum_category: enumSummary,
      categories_list: categories.map(c => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        parent_id: c.parent_id,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});