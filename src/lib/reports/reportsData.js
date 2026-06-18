// src/lib/reports/reportsData.js
//
// Função pura. Recebe entidades + mês + toggle e devolve a estrutura usada
// pela tela /relatorios. Toda a matemática mora aqui.
// Componentes consomem fatias prontas e não recalculam nada.

export function buildReportsData({ transactions, payables, categories, month, incluirCartao }) {
  // ---------------- 1. Resolver categoria ----------------
  const catById = new Map();
  const catBySlug = new Map();
  for (const c of categories) {
    catById.set(c.id, c);
    if (c.slug) catBySlug.set(String(c.slug).toLowerCase(), c);
  }

  function resolveCategory(record) {
    const byId = record.category_id ? catById.get(record.category_id) : null;
    const bySlug = record.category ? catBySlug.get(String(record.category).toLowerCase()) : null;
    const cat = byId || bySlug;
    if (!cat) return { id: null, name: '(sem categoria)', rootId: null, rootName: '(sem categoria)', type: null, color: null };

    let root = cat;
    for (let i = 0; i < 10 && root.parent_id; i++) {
      const parent = catById.get(root.parent_id);
      if (!parent) break;
      root = parent;
    }
    return {
      id: cat.id, name: cat.name,
      rootId: root.id, rootName: root.name,
      type: cat.type, color: root.color || cat.color || null,
    };
  }

  // ---------------- 2. Filtros de mês ----------------
  const txMonth = t => String(t.date || '').slice(0, 7);
  // Cartão: vencimento = competência por definição (Bug 7)
  const payMonth = p => p.origin_type === 'card'
    ? String(p.due_date || '').slice(0, 7)
    : String(p.competencia || p.due_date || '').slice(0, 7);

  // ---------------- 3. Conciliação ----------------
  const conciliatedPayableIds = new Set(
    transactions.filter(t => t.payable_id).map(t => t.payable_id)
  );

  // ---------------- 4. Itens da Atividade ----------------
  const atividadeItems = [];

  // 4a. Transações efetivas (exclui transferências)
  for (const t of transactions) {
    if (txMonth(t) !== month) continue;
    if (t.type !== 'expense') continue;
    const cat = resolveCategory(t);
    if (cat.type === 'transfer') continue;
    atividadeItems.push({
      source: 'transaction',
      id: t.id,
      date: String(t.date || '').slice(0, 10),
      description: t.description,
      amount: Number(t.amount || 0),
      payableId: t.payable_id || null,
      cat,
    });
  }

  // 4b. Provisionados de cartão sem conciliação (toggle ON)
  if (incluirCartao) {
    for (const p of payables) {
      if (payMonth(p) !== month) continue;
      if (p.status !== 'provisioned') continue;
      if (p.origin_type !== 'card') continue;
      if (conciliatedPayableIds.has(p.id)) continue;
      const cat = resolveCategory(p);
      if (cat.type === 'transfer') continue;
      atividadeItems.push({
        source: 'payable_card',
        id: p.id,
        date: String(p.due_date || '').slice(0, 10),
        description: p.description,
        amount: Number(p.amount || 0),
        payableId: p.id,
        cat,
      });
    }
  }

  const atividadeOK = atividadeItems.filter(i => i.cat.id !== null);
  const atividadeSemCat = atividadeItems.filter(i => i.cat.id === null);

  const atividade = {
    total: sum(atividadeOK),
    items: atividadeOK,
    semCategoria: { total: sum(atividadeSemCat), count: atividadeSemCat.length, items: atividadeSemCat },
    byCategoryLeaf: groupBy(atividadeOK, i => i.cat.id, i => ({ id: i.cat.id, name: i.cat.name, color: i.cat.color })),
    byCategoryRoot: groupBy(atividadeOK, i => i.cat.rootId, i => ({ id: i.cat.rootId, name: i.cat.rootName, color: i.cat.color })),
  };

  // ---------------- 5. Itens da Contas a Pagar ----------------
  const today = new Date().toISOString().slice(0, 10);
  const statusOf = i => {
    if (i.status === 'paid' || i.status === 'conciliated') return 'pagas';
    if (i.status === 'provisioned') return 'provisionadas';
    if (i.status === 'pending' && i.due < today) return 'vencidas';
    return 'pendentes';
  };

  const cpAll = [];
  for (const p of payables) {
    if (payMonth(p) !== month) continue;
    const cat = resolveCategory(p);
    const jaContadoEmAtividade =
      incluirCartao &&
      p.origin_type === 'card' &&
      p.status === 'provisioned' &&
      !conciliatedPayableIds.has(p.id) &&
      cat.type !== 'transfer' &&
      cat.id !== null;
    cpAll.push({
      source: 'payable',
      id: p.id,
      due: String(p.due_date || '').slice(0, 10),
      description: p.description,
      amount: Number(p.amount || 0),
      status: p.status,
      payableId: p.id,
      cat,
      jaContadoEmAtividade,
    });
  }

  const cpOK = cpAll.filter(i => i.cat.id !== null);
  const cpSemCat = cpAll.filter(i => i.cat.id === null);
  const jaContadosTotal = cpOK.filter(i => i.jaContadoEmAtividade).reduce((s, i) => s + i.amount, 0);

  const contasAPagar = {
    total: sum(cpOK) - jaContadosTotal,
    totalBruto: sum(cpOK),
    jaContadosTotal,
    items: cpOK,
    semCategoria: { total: sum(cpSemCat), count: cpSemCat.length, items: cpSemCat },
    byCategoryLeaf: groupBy(cpOK, i => i.cat.id, i => ({ id: i.cat.id, name: i.cat.name, color: i.cat.color })),
    byCategoryRoot: groupBy(cpOK, i => i.cat.rootId, i => ({ id: i.cat.rootId, name: i.cat.rootName, color: i.cat.color })),
    byStatus: {
      pagas:         pickStatus(cpOK, 'pagas', statusOf),
      pendentes:     pickStatus(cpOK, 'pendentes', statusOf),
      vencidas:      pickStatus(cpOK, 'vencidas', statusOf),
      provisionadas: pickStatus(cpOK, 'provisionadas', statusOf),
    },
  };

  // ---------------- 6. Reconciliação ----------------
  const payById = new Map(payables.map(p => [p.id, p]));

  const sso = atividadeOK.filter(i => i.source === 'transaction' && !i.payableId);
  const dms = cpOK.filter(i => i.status !== 'paid' && i.status !== 'conciliated' && !i.jaContadoEmAtividade);
  const limbo = atividadeOK.filter(i => {
    if (i.source !== 'transaction' || !i.payableId) return false;
    const p = payById.get(i.payableId);
    return p ? payMonth(p) !== month : false;
  });

  const reconciliacao = {
    confronto: {
      atividade: atividade.total,
      contasAPagar: contasAPagar.total,
      diferenca: atividade.total - contasAPagar.total,
    },
    saiuSemObrigacao: { total: sum(sso), count: sso.length, items: sso },
    deviaMasNaoSaiu:  { total: sum(dms), count: dms.length, items: dms },
    limbo:            { total: sum(limbo), count: limbo.length, items: limbo },
  };

  return { atividade, contasAPagar, reconciliacao };
}

// Exporta também payMonth para uso no useReportsData (byMonth6)
export function resolvePayMonth(p) {
  return p.origin_type === 'card'
    ? String(p.due_date || '').slice(0, 7)
    : String(p.competencia || p.due_date || '').slice(0, 7);
}

// ---------------- Helpers ----------------
function sum(items) { return items.reduce((s, i) => s + Number(i.amount || 0), 0); }

// groupBy retorna categoryName como alias de name para compatibilidade com componentes
function groupBy(items, keyFn, metaFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) {
      const meta = metaFn(item);
      map.set(key, { key, ...meta, categoryName: meta.name, total: 0, count: 0, items: [] });
    }
    const agg = map.get(key);
    agg.total += Number(item.amount || 0);
    agg.count++;
    agg.items.push(item);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

function pickStatus(items, s, statusOf) {
  const sel = items.filter(i => statusOf(i) === s);
  return { total: sum(sel), count: sel.length, items: sel };
}