/**
 * Resolve a categoria de um registro (Transaction ou Payable).
 * Fonte primária: category_id. Fallback: category (slug texto).
 * Sobe parent_id até raiz. Detecta drift (divergência).
 *
 * @param {object} record - Transaction ou Payable
 * @param {object} categoriesById - Map id → category
 * @param {object} categoriesBySlug - Map slug.toLowerCase() → category
 * @returns {object} resolved
 */
export function resolveCategory(record, categoriesById, categoriesBySlug) {
  let leafCat = null;
  let catIdValid = false;
  let catTextValid = false;
  let hasMismatch = false;
  let reason = '';

  // --- Resolver por category_id ---
  if (record.category_id) {
    const found = categoriesById[String(record.category_id)];
    if (found) {
      leafCat = found;
      catIdValid = true;
    } else {
      reason = `category_id "${record.category_id}" não encontrado na tabela de categorias`;
    }
  }

  // --- Fallback: resolver por slug texto ---
  let textCat = null;
  if (record.category) {
    textCat = categoriesBySlug[String(record.category).toLowerCase()];
    if (textCat) catTextValid = true;
  }

  // --- Detectar drift ---
  if (catIdValid && catTextValid && textCat && leafCat) {
    if (String(leafCat.id) !== String(textCat.id)) {
      hasMismatch = true;
      reason = `category_id aponta para "${leafCat.name}" mas category text="${record.category}" aponta para "${textCat.name}"`;
    }
  }

  // Se category_id inválido, usar fallback de texto
  if (!leafCat && textCat) {
    leafCat = textCat;
    if (record.category_id && !catIdValid) {
      hasMismatch = true;
    }
  }

  // --- Sem categoria ---
  if (!leafCat) {
    return {
      leafId: null,
      leafName: '(sem categoria)',
      leafSlug: null,
      leafType: 'expense',
      rootId: null,
      rootName: '(sem categoria)',
      rootSlug: null,
      rootColor: '#94A3B8',
      ancestors: [],
      drift: {
        hasMismatch,
        catIdValid,
        catTextValid,
        leafInactive: false,
        reason: reason || 'Sem category_id nem category text válidos',
      },
    };
  }

  const leafInactive = leafCat.active === false;

  // --- Subir até a raiz (max 10 níveis) ---
  const ancestors = [];
  let current = leafCat;
  let depth = 0;
  while (current.parent_id && depth < 10) {
    ancestors.unshift(current.id);
    const parent = categoriesById[String(current.parent_id)];
    if (!parent) {
      // parent_id aponta pra ID inexistente
      if (!reason) reason = `parent_id "${current.parent_id}" não encontrado — categoria órfã`;
      break;
    }
    current = parent;
    depth++;
  }
  ancestors.unshift(current.id);

  return {
    leafId: leafCat.id,
    leafName: leafCat.name,
    leafSlug: leafCat.slug,
    leafType: leafCat.type || 'expense',
    rootId: current.id,
    rootName: current.name,
    rootSlug: current.slug,
    rootColor: current.color || '#94A3B8',
    ancestors,
    drift: {
      hasMismatch,
      catIdValid,
      catTextValid,
      leafInactive,
      reason,
    },
  };
}

/**
 * Constrói os índices de lookup a partir de um array de categorias.
 */
export function buildCategoryIndexes(categories) {
  const categoriesById = {};
  const categoriesBySlug = {};
  (categories || []).forEach(c => {
    categoriesById[String(c.id)] = c;
    if (c.slug) categoriesBySlug[String(c.slug).toLowerCase()] = c;
  });
  return { categoriesById, categoriesBySlug };
}