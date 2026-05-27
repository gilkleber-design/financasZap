import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ALLOWED_VARIANCE = 5.00; // Margem de segurança para valores

const normalizeText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Tokeniza mantendo palavras relevantes
const tokenize = (value) => normalizeText(value).split(' ').filter((token) => token.length > 2);

const scoreOpenItem = ({ item, amount, description, kind }) => {
  const data = item || {};
  let score = 0;

  const itemAmount = kind === 'receivable' && data.net_amount ? Number(data.net_amount) : Number(data.amount);
  
  // 1. Verificação de Valor (com margem de erro)
  const diff = Math.abs(itemAmount - Number(amount));
  if (diff > ALLOWED_VARIANCE) return -1;
  score += 60; // Peso alto para o valor

  // 2. Verificação de Descrição (Match parcial inteligente)
  const inputTokens = tokenize(description);
  const itemText = normalizeText(data.description);
  
  const matchedTokens = inputTokens.filter((token) => itemText.includes(token));
  
  // Se não houver nenhum match de palavra, penalizamos forte, mas não descartamos imediatamente
  if (matchedTokens.length === 0) {
    score -= 30;
  } else {
    score += matchedTokens.length * 20;
  }

  return score;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const { amount, description } = payload; // Agora você só precisa enviar esses dois

    const [payables, receivables] = await Promise.all([
      base44.entities.Payable.filter({}),
      base44.entities.Receivable.filter({}),
    ]);

    const ranked = [
      ...payables.filter(i => ['pending', 'provisioned'].includes(i?.status)).map((item) => ({
        kind: 'payable',
        item,
        score: scoreOpenItem({ item, amount, description, kind: 'payable' }),
      })),
      ...receivables.filter(i => i?.status === 'pending').map((item) => ({
        kind: 'receivable',
        item,
        score: scoreOpenItem({ item, amount, description, kind: 'receivable' }),
      })),
    ]
      .filter((item) => item.score > 40) // Filtra apenas o que tem pontuação aceitável
      .sort((a, b) => b.score - a.score);

    return Response.json({ 
      success: true, 
      best_match: ranked[0] || null, 
      matches: ranked 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});