import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const normalizeText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (value) => normalizeText(value).split(' ').filter((token) => token.length > 2);

const isCloseDate = (baseDate, dueDate) => {
  if (!baseDate || !dueDate) return false;
  const base = new Date(`${baseDate}T12:00:00`);
  const due = new Date(String(dueDate).slice(0, 10) + 'T12:00:00');
  const diffDays = Math.abs((due.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays <= 35;
};

const scoreOpenItem = ({ item, amount, description, date, originId, originType, kind }) => {
  const data = item || {};
  let score = 0;

  const itemAmount = kind === 'receivable' && data.net_amount ? Number(data.net_amount) : Number(data.amount);
  if (itemAmount !== Number(amount)) return -1;
  score += 50;

  const inputTokens = tokenize(description);
  const itemText = normalizeText(data.description);
  const matchedTokens = inputTokens.filter((token) => itemText.includes(token));

  if (matchedTokens.length === 0) return -1;
  score += matchedTokens.length * 15;

  if (isCloseDate(date, data.due_date)) score += 20;

  if (originId) {
    if (kind === 'payable' && data.origin_id === originId) score += 25;
    if (kind === 'receivable' && data.account_id === originId) score += 25;
  }

  if (originType && kind === 'payable' && data.origin_type === originType) score += 15;

  if (data.installment_number) score += 5;
  if (data.installment_count) score += 5;

  return score;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { amount, description, date, origin_id, origin_type } = payload;

    if (!amount || !description) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const [payables, receivables] = await Promise.all([
      base44.entities.Payable.filter({}),
      base44.entities.Receivable.filter({}),
    ]);

    const openPayables = payables.filter((item) => {
      const status = item?.status;
      return status === 'pending' || status === 'provisioned';
    });

    const openReceivables = receivables.filter((item) => item?.status === 'pending');

    const ranked = [
      ...openPayables.map((item) => ({
        kind: 'payable',
        item,
        score: scoreOpenItem({
          item,
          amount,
          description,
          date,
          originId: origin_id,
          originType: origin_type,
          kind: 'payable',
        }),
      })),
      ...openReceivables.map((item) => ({
        kind: 'receivable',
        item,
        score: scoreOpenItem({
          item,
          amount,
          description,
          date,
          originId: origin_id,
          originType: origin_type,
          kind: 'receivable',
        }),
      })),
    ]
      .filter((item) => item.score >= 70)
      .sort((a, b) => b.score - a.score);

    const matches = ranked.map(({ kind, item, score }) => ({
      id: item.id,
      match_type: kind,
      score,
      description: item.description || '',
      amount: kind === 'receivable' && item.net_amount ? item.net_amount : (item.amount || 0),
      gross_amount: kind === 'receivable' ? (item.amount || 0) : null,
      due_date: item.due_date || null,
      status: item.status || null,
      installment_number: item.installment_number || null,
      installment_count: item.installment_count || null,
      origin_id: kind === 'payable' ? (item.origin_id || null) : (item.account_id || null),
      origin_type: kind === 'payable' ? (item.origin_type || null) : 'account',
      category: item.category || null,
      category_id: item.category_id || null,
      account_id: item.account_id || null,
      income_source_id: item.income_source_id || null,
    }));

    return Response.json({
      success: true,
      found: matches.length > 0,
      best_match: matches[0] || null,
      matches,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});