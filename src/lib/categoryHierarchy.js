/**
 * Resolve a categoria raiz de um item (Transaction ou Payable).
 * Usa category_id se existir; senão resolve category (slug) → id via lookup.
 * Sobe pelo parent_id até encontrar a raiz.
 *
 * Retorna: { rootId, rootName, rootColor, subcatId, subcatName }
 */
export function categorizeByRoot(item, categories) {
  const slugToId = {};
  const idMap = {};
  categories.forEach(c => {
    idMap[c.id] = c;
    if (c.slug) slugToId[String(c.slug).toLowerCase()] = c.id;
  });

  // Resolve categoria efetiva
  let catId = item.category_id;
  if (!catId && item.category) {
    catId = slugToId[String(item.category).toLowerCase()];
  }

  if (!catId) {
    return {
      rootId: 'sem_categoria',
      rootName: 'Sem Categoria',
      rootColor: '#94A3B8',
      subcatId: null,
      subcatName: null,
    };
  }

  // Sobe até a raiz
  let current = idMap[catId];
  if (!current) {
    return {
      rootId: 'sem_categoria',
      rootName: 'Sem Categoria',
      rootColor: '#94A3B8',
      subcatId: null,
      subcatName: null,
    };
  }

  let subcat = null;
  // Se já tem parent, o atual é subcat e vamos subir
  if (current.parent_id) {
    subcat = current;
    let parent = idMap[current.parent_id];
    // Sobe recursivamente (suporta hierarquias mais profundas)
    while (parent && parent.parent_id) {
      subcat = parent;
      parent = idMap[parent.parent_id];
    }
    current = parent || current;
  }

  return {
    rootId: current.id,
    rootName: current.name,
    rootColor: current.color || '#94A3B8',
    subcatId: subcat ? subcat.id : null,
    subcatName: subcat ? subcat.name : null,
  };
}