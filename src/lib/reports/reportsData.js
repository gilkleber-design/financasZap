import { resolveCategory, buildCategoryIndexes } from './categoryResolver.js';

const TODAY = () => new Date().toISOString().slice(0, 10);

function addToGroup(groups, key, item, resolver) {
  if (!groups[key]) {
    groups[key] = {
      categoryId: resolver.rootId === key ? resolver.rootId : resolver.leafId,
      categoryName: resolver.rootId === key ? resolver.rootName : resolver.leafName,
      color: resolver.rootColor,
      total: 0,
      budget: 0,
      count: 0,
      items: [],
    };
  }
  groups[key].total += item._amount;
  groups[key].count += 1;
  groups[key].items.push(item);
}

function sortGroups(groups) {
  return Object.values(groups).sort((a, b) => b.total - a.total);
}

// Bug 7: Payables origin_type='card' usam due_date como mês canônico
function payableMonth(payable) {
  if (payable.origin_type === 'card') {
    return String(payable.due_date || '').slice(0, 7);
  }
  return String(payable.competencia || payable.due_date || '').slice(0, 7);
}

/**
 * Função pura. Recebe entidades brutas + configuração, retorna estrutura canônica.
 */
export function buildReportsData({ transactions, payables, categories, receivables, budgets, incomeSources, month, incluirCartao }) {
  const { categoriesById, categoriesBySlug } = buildCategoryIndexes(categories);
  const today = TODAY();

  // ----------- HELPERS -----------
  const inMonth = (dateStr) => dateStr && String(dateStr).slice(0, 7) === month;

  function resolveRec(record) {
    return resolveCategory(record, categoriesById, categoriesBySlug);
  }

  // ----------- PAYABLES DO MÊS (Bug 7: usa payableMonth) -----------
  const payablesDoMes = payables.filter(p => payableMonth(p) === month);

  // Payables indexados por ID
  const payablesById = {};
  payables.forEach(p => { payablesById[p.id] = p; });

  // IDs de payables que têm Transaction conciliada (em qualquer data)
  const conciliatedPayableIds = new Set();
  transactions.forEach(t => { if (t.payable_id) conciliatedPayableIds.add(t.payable_id); });

  // ----------- TRANSACTIONS DO MÊS -----------
  const txDoMes = transactions.filter(t => inMonth(t.date));

  // ----------- PROVISIONADOS DE CARTÃO (para toggle) -----------
  const provisionadosCartao = incluirCartao
    ? payablesDoMes.filter(p => {
        if (p.status !== 'provisioned') return false;
        if (p.origin_type !== 'card') return false;
        if (conciliatedPayableIds.has(p.id)) return false;
        const r = resolveRec(p);
        if (r.leafType === 'transfer') return false;
        return true;
      })
    : [];

  const provisionadosIds = new Set(provisionadosCartao.map(p => p.id));

  // ----------- ATIVIDADE: montar items -----------
  // Bug 4: separar itens sem categoria
  const atividadeItems = [];
  const atividadeSemCatItems = [];

  txDoMes.forEach(t => {
    if (t.type !== 'expense') return;
    const r = resolveRec(t);
    if (r.leafType === 'transfer') return;
    const item = {
      id: t.id,
      source: 'transaction',
      date: t.date,
      description: t.description,
      amount: Number(t.amount || 0),
      _amount: Number(t.amount || 0),
      type: t.type,
      payableId: t.payable_id || null,
      resolver: r,
      status: t.status,
    };
    if (!r.leafId) {
      atividadeSemCatItems.push(item);
    } else {
      atividadeItems.push(item);
    }
  });

  provisionadosCartao.forEach(p => {
    const r = resolveRec(p);
    const item = {
      id: p.id,
      source: 'payable_card',
      date: p.competencia || p.due_date,
      description: p.description,
      amount: Number(p.amount || 0),
      _amount: Number(p.amount || 0),
      type: 'expense',
      payableId: p.id,
      resolver: r,
      status: p.status,
    };
    if (!r.leafId) {
      atividadeSemCatItems.push(item);
    } else {
      atividadeItems.push(item);
    }
  });

  const atividadeTotal = atividadeItems.reduce((s, i) => s + i._amount, 0);

  // Receitas do mês
  const totalReceitas = txDoMes
    .filter(t => t.type === 'income')
    .reduce((s, t) => s + Number(t.net_amount || t.amount || 0), 0);

  // ----------- BUDGET por categoria (Bug 1 fix) -----------
  const [yearStr, monthStr] = month.split('-');
  const yearNum = Number(yearStr);
  const monthNum = Number(monthStr);
  const budgetsDoMes = (budgets || []).filter(b => b.month === monthNum && b.year === yearNum);

  // Budget por leafId e rootId
  const budgetByLeafId = {};
  const budgetByRootId = {};
  budgetsDoMes.forEach(b => {
    const cat = categoriesById[b.category_id];
    if (!cat) return;
    const rootId = cat.parent_id ? String(cat.parent_id) : String(cat.id);
    budgetByLeafId[String(cat.id)] = (budgetByLeafId[String(cat.id)] || 0) + Number(b.amount || 0);
    budgetByRootId[rootId] = (budgetByRootId[rootId] || 0) + Number(b.amount || 0);
  });

  // Agrupamentos atividade
  const atividadeLeafGroups = {};
  const atividadeRootGroups = {};
  atividadeItems.forEach(item => {
    const r = item.resolver;
    const leafKey = r.leafId;
    const rootKey = r.rootId || r.leafId;

    addToGroup(atividadeLeafGroups, leafKey, item, { ...r, rootId: leafKey, rootName: r.leafName });
    addToGroup(atividadeRootGroups, rootKey, item, r);
  });

  // Corrigir nomes e injetar budget nos leaf groups
  Object.entries(atividadeLeafGroups).forEach(([key, g]) => {
    const cat = categoriesById[key];
    if (cat) { g.categoryId = cat.id; g.categoryName = cat.name; g.color = cat.color || '#94A3B8'; }
    g.budget = budgetByLeafId[key] || 0;
  });
  // Injetar budget nos root groups
  Object.entries(atividadeRootGroups).forEach(([key, g]) => {
    const cat = categoriesById[key];
    if (cat) { g.categoryId = cat.id; g.categoryName = cat.name; g.color = cat.color || '#94A3B8'; }
    g.budget = budgetByRootId[key] || 0;
  });

  // ----------- ATIVIDADE: byMonth6 -----------
  const byMonth6 = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(month + '-01');
    d.setMonth(d.getMonth() - (5 - i));
    const m = d.toISOString().slice(0, 7);

    const txM = transactions.filter(t => inMonthKey(t.date, m));
    const provM = incluirCartao
      ? payables.filter(p => {
          if (payableMonth(p) !== m) return false;
          if (p.status !== 'provisioned') return false;
          if (p.origin_type !== 'card') return false;
          if (conciliatedPayableIds.has(p.id)) return false;
          const r = resolveRec(p);
          return r.leafType !== 'transfer';
        })
      : [];

    const despesas = txM.filter(t => {
      if (t.type !== 'expense') return false;
      const r = resolveRec(t);
      return r.leafType !== 'transfer';
    }).reduce((s, t) => s + Number(t.amount || 0), 0)
      + provM.reduce((s, p) => s + Number(p.amount || 0), 0);

    const receitas = txM.filter(t => t.type === 'income')
      .reduce((s, t) => s + Number(t.net_amount || t.amount || 0), 0);

    return {
      monthKey: m,
      name: formatMonthLabel(m),
      receitas,
      despesas,
      Receitas: receitas,
      Despesas: despesas,
      saldo: receitas - despesas,
    };
  });

  // ----------- CONTAS A PAGAR -----------
  // Bug 4: separar itens sem categoria
  const contasItems = [];
  const contasSemCatItems = [];

  payablesDoMes.forEach(p => {
    const r = resolveRec(p);
    const jaContadoEmAtividade = provisionadosIds.has(p.id);
    const item = {
      id: p.id,
      dueDate: p.due_date,
      competencia: p.competencia,
      description: p.description,
      amount: Number(p.amount || 0),
      _amount: Number(p.amount || 0),
      status: p.status,
      resolver: r,
      jaContadoEmAtividade,
      origin_type: p.origin_type,
      installment_number: p.installment_number,
      installment_count: p.installment_count,
    };
    if (!r.leafId) {
      contasSemCatItems.push(item);
    } else {
      contasItems.push(item);
    }
  });

  const allContasItems = [...contasItems, ...contasSemCatItems];

  const contasJaContadas = allContasItems.filter(i => i.jaContadoEmAtividade);
  const contasPendentesTotal = allContasItems
    .filter(i => i.status !== 'paid' && i.status !== 'conciliated')
    .reduce((s, i) => s + i._amount, 0);
  const contasJaContadasTotal = contasJaContadas.reduce((s, i) => s + i._amount, 0);
  const contasTotal = contasPendentesTotal - (incluirCartao ? contasJaContadasTotal : 0);

  // byStatus (usa allContasItems para não perder os sem categoria nos cards)
  const pagas = allContasItems.filter(i => i.status === 'paid' || i.status === 'conciliated');
  const pendentes = allContasItems.filter(i => i.status === 'pending' && i.dueDate >= today);
  const vencidas = allContasItems.filter(i => i.status === 'pending' && i.dueDate < today);
  const provisionadas = allContasItems.filter(i => i.status === 'provisioned');

  const sum = arr => arr.reduce((s, i) => s + i._amount, 0);
  const totalBrutoCap = allContasItems.reduce((s, i) => s + i._amount, 0);

  // Agrupamentos contas (apenas itens COM categoria — Bug 4)
  const contasLeafGroups = {};
  const contasRootGroups = {};
  contasItems.forEach(item => {
    const r = item.resolver;
    const leafKey = r.leafId;
    const rootKey = r.rootId || r.leafId;
    addToGroup(contasLeafGroups, leafKey, item, { ...r, rootId: leafKey, rootName: r.leafName });
    addToGroup(contasRootGroups, rootKey, item, r);
  });
  Object.entries(contasLeafGroups).forEach(([key, g]) => {
    const cat = categoriesById[key];
    if (cat) { g.categoryId = cat.id; g.categoryName = cat.name; g.color = cat.color || '#94A3B8'; }
  });
  Object.entries(contasRootGroups).forEach(([key, g]) => {
    const cat = categoriesById[key];
    if (cat) { g.categoryId = cat.id; g.categoryName = cat.name; g.color = cat.color || '#94A3B8'; }
  });

  // ----------- RECONCILIAÇÃO -----------
  const ssoItems = txDoMes.filter(t => {
    if (t.type !== 'expense') return false;
    if (t.payable_id) return false;
    const r = resolveRec(t);
    return r.leafType !== 'transfer';
  }).map(t => ({ ...t, _amount: Number(t.amount || 0), resolver: resolveRec(t) }));

  const dmnsItems = payablesDoMes.filter(p => {
    if (p.status === 'paid' || p.status === 'conciliated') return false;
    if (conciliatedPayableIds.has(p.id)) return false;
    if (incluirCartao && provisionadosIds.has(p.id)) return false;
    return true;
  }).map(p => ({ ...p, _amount: Number(p.amount || 0), resolver: resolveRec(p) }));

  const limboItems = txDoMes.filter(t => {
    if (t.type !== 'expense') return false;
    if (!t.payable_id) return false;
    const p = payablesById[t.payable_id];
    if (!p) return false;
    if (payableMonth(p) === month) return false;
    return true;
  }).map(t => {
    const p = payablesById[t.payable_id];
    return {
      ...t,
      _amount: Number(t.amount || 0),
      resolver: resolveRec(t),
      payableCompetenciaMonth: p ? payableMonth(p) : null,
    };
  });

  const txConciliaPayableDoMes = txDoMes.filter(t => {
    if (!t.payable_id) return false;
    const p = payablesById[t.payable_id];
    if (!p) return false;
    return payableMonth(p) === month;
  });
  const sumTxConcilia = txConciliaPayableDoMes.reduce((s, t) => s + Number(t.amount || 0), 0);
  const sumProvisionadosContados = provisionadosCartao.reduce((s, p) => s + Number(p.amount || 0), 0);

  const confrontoAtividade = atividadeTotal;
  const confrontoContas = contasTotal;
  const diferenca = confrontoAtividade - confrontoContas;

  const somaExplicada = (ssoItems.reduce((s, i) => s + i._amount, 0))
    + (limboItems.reduce((s, i) => s + i._amount, 0))
    + sumTxConcilia
    + sumProvisionadosContados;
  const diferencaInexplicada = Math.abs(atividadeTotal - somaExplicada);
  const confrontoFecha = diferencaInexplicada < 1.0;

  // Drift: transações
  const transacoesComDrift = transactions.filter(t => {
    const r = resolveRec(t);
    return r.drift.hasMismatch || r.drift.leafInactive || !r.drift.catIdValid && (t.category_id || t.category);
  }).slice(0, 50).map(t => {
    const r = resolveRec(t);
    return { id: t.id, description: t.description, amount: t.amount, date: t.date, drift: r.drift };
  });

  const payablesComDrift = payables.filter(p => {
    const r = resolveRec(p);
    return r.drift.hasMismatch || r.drift.leafInactive || !r.drift.catIdValid && (p.category_id || p.category);
  }).slice(0, 50).map(p => {
    const r = resolveRec(p);
    return { id: p.id, description: p.description, amount: p.amount, drift: r.drift };
  });

  const categoriasOrfas = categories.filter(c => {
    if (!c.parent_id) return false;
    return !categoriesById[String(c.parent_id)];
  }).map(c => ({ id: c.id, name: c.name, slug: c.slug, missingParentId: c.parent_id }));

  // ----------- FISCAL (Bug 3: lookup nome do IncomeSource) -----------
  const incomeSourcesMap = {};
  (incomeSources || []).forEach(s => { incomeSourcesMap[s.id] = s; });

  const recebidosDoMes = (receivables || []).filter(r =>
    r.status === 'received' && inMonth(r.due_date)
  );
  const fiscalBySource = {};
  recebidosDoMes.forEach(item => {
    const key = item.income_source_id || 'outras';
    if (!fiscalBySource[key]) fiscalBySource[key] = { gross: 0, tax: 0 };
    const gross = Number(item.amount || 0);
    const tax = gross * (Number(item.tax_rate || 0) / 100);
    fiscalBySource[key].gross += gross;
    fiscalBySource[key].tax += tax;
  });
  const totalBruto = Object.values(fiscalBySource).reduce((s, i) => s + i.gross, 0);
  const totalImpostos = Object.values(fiscalBySource).reduce((s, i) => s + i.tax, 0);
  const totalLiquido = totalBruto - totalImpostos;
  const aliquotaEfetiva = totalBruto > 0 ? `${((totalImpostos / totalBruto) * 100).toFixed(1)}%` : '0.0%';
  const sourceRows = Object.entries(fiscalBySource).map(([sourceId, data]) => {
    const source = incomeSourcesMap[sourceId];
    return {
      sourceId,
      name: source ? source.name : sourceId === 'outras' ? 'Outras' : '(fonte não encontrada)',
      tax: data.tax,
      gross: data.gross,
    };
  }).sort((a, b) => b.tax - a.tax);

  // ----------- PlannedVsActual: usa byCategoryRoot/Leaf já com budget embutido -----------
  // (Bug 1 + 2: consome aggregation com budget já embutido, sem recalcular)
  // Combinar budgets que não têm grupo com atividadeRootGroups
  const allRootIds = new Set([
    ...Object.keys(budgetByRootId),
    ...Object.keys(atividadeRootGroups),
  ]);
  const plannedVsActual = Array.from(allRootIds)
    .filter(rootId => rootId !== 'sem_categoria')
    .map(rootId => {
      const actual = atividadeRootGroups[rootId]?.total || 0;
      const limit = budgetByRootId[rootId] || 0;
      const hasLimit = limit > 0;
      const percent = hasLimit ? (actual / limit) * 100 : 0;
      const cat = categoriesById[rootId];
      const name = cat?.name || atividadeRootGroups[rootId]?.categoryName || rootId;
      return { rootId, name, actual, limit, hasLimit, percent };
    }).sort((a, b) => {
      if (a.hasLimit && b.hasLimit) return b.percent - a.percent;
      if (a.hasLimit) return -1;
      if (b.hasLimit) return 1;
      return b.actual - a.actual;
    });

  return {
    atividade: {
      total: atividadeTotal,
      totalReceitas,
      byCategoryLeaf: sortGroups(atividadeLeafGroups),
      byCategoryRoot: sortGroups(atividadeRootGroups),
      byMonth6,
      plannedVsActual,
      semCategoria: {
        total: atividadeSemCatItems.reduce((s, i) => s + i._amount, 0),
        count: atividadeSemCatItems.length,
        items: atividadeSemCatItems,
      },
      items: atividadeItems,
    },
    contasAPagar: {
      total: contasTotal,
      totalBruto: totalBrutoCap,
      totalJaContado: contasJaContadasTotal,
      byStatus: {
        pagas:         { total: sum(pagas),         count: pagas.length,         items: pagas,         jaContado: sum(pagas.filter(i => i.jaContadoEmAtividade)) },
        pendentes:     { total: sum(pendentes),     count: pendentes.length,     items: pendentes,     jaContado: sum(pendentes.filter(i => i.jaContadoEmAtividade)) },
        vencidas:      { total: sum(vencidas),      count: vencidas.length,      items: vencidas,      jaContado: sum(vencidas.filter(i => i.jaContadoEmAtividade)) },
        provisionadas: { total: sum(provisionadas), count: provisionadas.length, items: provisionadas, jaContado: sum(provisionadas.filter(i => i.jaContadoEmAtividade)) },
      },
      byCategoryLeaf: sortGroups(contasLeafGroups),
      byCategoryRoot: sortGroups(contasRootGroups),
      semCategoria: {
        total: contasSemCatItems.reduce((s, i) => s + i._amount, 0),
        count: contasSemCatItems.length,
        items: contasSemCatItems,
      },
      items: allContasItems,
    },
    reconciliacao: {
      confronto: {
        atividade: confrontoAtividade,
        contasAPagar: confrontoContas,
        diferenca,
      },
      saiuSemObrigacao: {
        total: ssoItems.reduce((s, i) => s + i._amount, 0),
        count: ssoItems.length,
        items: ssoItems,
      },
      deviaMasNaoSaiu: {
        total: dmnsItems.reduce((s, i) => s + i._amount, 0),
        count: dmnsItems.length,
        items: dmnsItems,
      },
      limbo: {
        total: limboItems.reduce((s, i) => s + i._amount, 0),
        count: limboItems.length,
        items: limboItems,
      },
    },
    fiscal: {
      totalBruto,
      totalImpostos,
      totalLiquido,
      aliquotaEfetiva,
      sourceRows,
    },
    invariantes: {
      confrontoFecha,
      diferencaInexplicada,
      transacoesComDrift,
      payablesComDrift,
      categoriasOrfas,
    },
  };
}

function inMonthKey(dateStr, m) {
  return dateStr && String(dateStr).slice(0, 7) === m;
}

function formatMonthLabel(m) {
  const [y, mo] = m.split('-');
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${months[Number(mo) - 1]}/${String(y).slice(2)}`;
}