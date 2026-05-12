import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payables = await base44.entities.Payable.list('-due_date', 1000);
    const categories = await base44.entities.Category.list('name', 100);
    
    // Criar mapa de categorias
    const catMap = {};
    categories.forEach(c => {
      catMap[c.id] = c;
    });

    // Agrupar por categoria raiz
    const byRoot = {};
    
    payables.forEach(p => {
      let rootKey;
      
      if (p.category_id) {
        const cat = catMap[p.category_id];
        if (cat?.parent_id) {
          // É subcategoria: usar parent_id
          rootKey = cat.parent_id;
        } else {
          // É categoria raiz personalizada
          rootKey = p.category_id;
        }
      } else {
        // Usar enum category
        rootKey = p.category || 'outros';
      }
      
      if (!byRoot[rootKey]) {
        byRoot[rootKey] = { items: [], label: null };
      }
      byRoot[rootKey].items.push(p);
      
      // Guardar label
      if (catMap[rootKey]) {
        byRoot[rootKey].label = catMap[rootKey].name;
      }
    });

    // Criar resultado final
    const summary = Object.entries(byRoot).map(([rootKey, data]) => {
      const label = data.label || rootKey;
      const total = data.items.reduce((s, i) => s + (i.amount || 0), 0);
      return {
        root_id: rootKey,
        category_name: label,
        count: data.items.length,
        total: total,
      };
    }).sort((a, b) => b.total - a.total);

    const grandTotal = summary.reduce((s, c) => s + c.total, 0);

    return Response.json({
      categories: summary,
      grand_total: grandTotal,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});