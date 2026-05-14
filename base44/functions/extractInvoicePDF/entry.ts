import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import * as pdfjsModule from 'npm:pdfjs-dist@3.11.174/legacy/build/pdf.js';

const pdfjsLib = pdfjsModule.default || pdfjsModule;
const MAX_TEXT_CHARS_FOR_LLM = 120000;

function nowLabel(startedAt, label) {
  const elapsed = Date.now() - startedAt;
  console.log(`[extractInvoicePDF] ${label}: ${elapsed}ms`);
}

function normalizePdfText(text) {
  return String(text || '')
    .normalize('NFC')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/(\d{2}\/\d)\s+(\d)/g, '$1$2')
    .replace(/(\d{1,3}(?:\.\d{3})*,)\s+(\d{2})/g, '$1$2')
    .replace(/Lan\s*[cç]\s*amentos/gi, 'Lançamentos')
    .replace(/Pa\s*g\s*a\s*m\s*e\s*n\s*t\s*o/gi, 'Pagamento')
    .replace(/Pa\s*g\s*a\s*m\s*e\s*n\s*t\s*o\s*s/gi, 'Pagamentos')
    .replace(/L\s*i\s*m\s*i\s*t\s*e/gi, 'Limite')
    .replace(/T\s*o\s*t\s*a\s*l/gi, 'Total')
    .replace(/Pr\s*[oó]\s*dutos/gi, 'Produtos')
    .replace(/Pr\s*[oó]\s*xima/gi, 'Próxima')
    .replace(/Pr\s*[oó]\s*ximas/gi, 'Próximas')
    .replace(/Servi\s*[cç]\s*os/gi, 'Serviços')
    .replace(/Compras\s+e\s+Saques/gi, 'Compras e Saques')
    .replace(/\bs\s*[aá]\s*[uú]\s*de\b/gi, 'saúde')
    .replace(/vestu\s*[aá]\s*rio/gi, 'vestuário')
    .replace(/\n{3,}/g, '\n\n');
}

async function extractTextFromPDF(buffer) {
  const loadingTask = pdfjsLib.getDocument({
    data: buffer,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const streamPages = [];
  const rowPages = [];
  const columnPages = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const rows = [];

    for (const item of content.items) {
      const str = String(item.str || '').trim();
      if (!str) continue;

      const x = Math.round(item.transform[4]);
      const y = Math.round(item.transform[5]);
      let row = rows.find(r => Math.abs(r.y - y) <= 3);
      if (!row) {
        row = { y, items: [] };
        rows.push(row);
      }
      row.items.push({ x, str });
    }

    const sortedRows = rows.sort((a, b) => b.y - a.y);

    streamPages.push(content.items.map(item => String(item.str || '').trim()).filter(Boolean).join('\n'));
    rowPages.push(sortedRows
      .map(row => row.items.sort((a, b) => a.x - b.x).map(it => it.str).join(' '))
      .join('\n'));

    const leftText = sortedRows
      .map(row => row.items.filter(it => it.x < 300).sort((a, b) => a.x - b.x).map(it => it.str).join(' '))
      .filter(Boolean)
      .join('\n');

    const rightText = sortedRows
      .map(row => row.items.filter(it => it.x >= 300).sort((a, b) => a.x - b.x).map(it => it.str).join(' '))
      .filter(Boolean)
      .join('\n');

    columnPages.push(`${leftText}\n--- COLUMN BREAK ---\n${rightText}`);
  }

  return {
    streamText: normalizePdfText(streamPages.join('\n--- PAGE BREAK ---\n')),
    rowText: normalizePdfText(rowPages.join('\n--- PAGE BREAK ---\n')),
    columnText: normalizePdfText(columnPages.join('\n--- PAGE BREAK ---\n')),
  };
}

function brlToNumber(value) {
  return Number(String(value).replace(/\./g, '').replace(',', '.'));
}

function roundMoney(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function resolveDate(date, refMonth) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;

  const [refYear, refMonthNum] = refMonth.split('-').map(Number);
  const [day, month] = date.split('/');
  const itemMonth = Number(month);
  const year = itemMonth > refMonthNum ? refYear - 1 : refYear;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function cleanDescription(description) {
  return String(description || '')
    .replace(/\s+(transporte|alimentacao|alimentação|sa[uú]de|educacao|educação|lazer|vestuario|vestuário|servicos|serviços|supermercado|restaurante|outros|farmacia|farmácia)\s+\S+$/i, '')
    .replace(/\b(MAIS\s+DETALHES|DETALHES|VER\s+MAIS)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function descriptionFingerprint(description) {
  return String(description || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(MAIS\s+DETALHES|DETALHES|VER\s+MAIS)\b/gi, '')
    .replace(/[^A-Z0-9]/gi, '')
    .replace(/^DL/, '')
    .toUpperCase();
}

function compactText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase();
}

function isSameTransaction(a, b) {
  if (a.date !== b.date || a.amount !== b.amount) return false;
  if ((a.parcel_current || '') !== (b.parcel_current || '')) return false;
  if ((a.parcel_total || '') !== (b.parcel_total || '')) return false;

  const aDesc = descriptionFingerprint(a.description);
  const bDesc = descriptionFingerprint(b.description);
  return aDesc === bDesc || aDesc.includes(bDesc) || bDesc.includes(aDesc);
}

function isSameInstallmentPurchase(a, b) {
  if (!a.parcel_total || !b.parcel_total) return false;
  if (a.date !== b.date || a.amount !== b.amount || a.parcel_total !== b.parcel_total) return false;

  const aDesc = descriptionFingerprint(a.description);
  const bDesc = descriptionFingerprint(b.description);
  return aDesc === bDesc || aDesc.includes(bDesc) || bDesc.includes(aDesc);
}

function isLikelyDescription(line) {
  if (!line || line.length < 3) return false;
  if (/^\d{2}\/\d{2}$/.test(line)) return false;
  if (/^-?\d{1,3}(?:\.\d{3})*,\d{2}$/.test(line)) return false;
  if (/^(DATA|VALOR|ESTABELECIMENTO|TOTAL|SUBTOTAL|SALDO|LIMITE|JUROS|MULTA|IOF|ENCARGOS|LANÇAMENTOS|COMPRAS|SAQUES|PRODUTOS|SERVIÇOS|PRÓXIMA|ANUIDADE|DESCONTOS|CAIXA|DISPON[IÍ]VEL|UTILIZADO|CONTINUA|PAGAMENTO)$/i.test(line)) return false;
  if (/\b(LIMITE|TOTAL\s+(DA|DESTA|DOS|PARA|LANÇAMENTOS|TRANS[AÁ]ÇÕES)|PR[ÓO]XIMA\s+FATURA|DEMAIS\s+FATURAS|VALOR\s+EM\s+R\$|CR[EÉ]DITO\s+ROTATIVO|ENCARGOS?\s+FINANCEIROS|JUROS\s+DO|JUROS\s+DE|MULTA\s+POR|IOF\s+DE)\b/i.test(line)) return false;
  if (/^(transporte|alimentacao|alimentação|sa[uú]de|educacao|educação|lazer|vestuario|vestuário|servicos|serviços|supermercado|restaurante|outros|farmacia|farmácia)\b/i.test(line)) return false;

  const compact = compactText(line);
  if (/^(PAGAMENTO|PAGAMENTOS|TOTALDOSPAGAMENTOS|LIMITETOTALDECREDITO|LIMITEDISPONIVEL|LIMITETOTALUTILIZADO|PROXIMAFATURA|DEMAISFATURAS|TOTALPARAPROXIMASFATURAS)/.test(compact)) return false;
  return /[A-Za-zÀ-ÿ]/.test(line);
}

function extractExpectedTotal(raw) {
  const patterns = [
    /Lançamentos atuais\s+([\d.]+\s*,\s*\d{2})/i,
    /L\s+Lançamentos atuais\s+([\d.]+\s*,\s*\d{2})/i,
    /Total dos lançamentos atuais\s+([\d.]+\s*,\s*\d{2})/i,
    /L\s+Total dos lançamentos atuais\s+([\d.]+\s*,\s*\d{2})/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) return brlToNumber(match[1].replace(/\s+/g, ''));
  }

  return null;
}

function isFinanceChargeItem(description) {
  const text = description || '';
  if (/REPASSE\s+DE\s+IOF/i.test(text)) return false;
  return /\b(MULTA|JUROS\s+DE\s+MORA|JUROS\s+DO\s+ROTATIVO|ENCARGOS?\s+REFINANCIAMENT|ENCARGOS?\s+FINANCEIROS|IOF(?:\s+DE\s+FINANCIAMENTO)?)\b/i.test(text);
}

function normalizeItem(item, refMonth) {
  if (!item || !item.date || !item.description) return null;

  const date = /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : resolveDate(item.date, refMonth);
  const amount = roundMoney(item.amount);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!Number.isFinite(amount)) return null;

  return {
    date,
    description: cleanDescription(item.description),
    amount,
    is_reversal: !!item.is_reversal || amount < 0,
    parcel_current: item.parcel_current || null,
    parcel_total: item.parcel_total || null,
  };
}

function dedupeItems(items) {
  const uniqueItems = [];

  for (const item of items) {
    const existingIndex = uniqueItems.findIndex(existing => isSameTransaction(existing, item) || isSameInstallmentPurchase(existing, item));
    if (existingIndex >= 0) {
      const current = uniqueItems[existingIndex];
      const shouldReplace = item.description.length > current.description.length || (item.parcel_current || 0) < (current.parcel_current || 0);
      if (shouldReplace) uniqueItems[existingIndex] = item;
      continue;
    }
    uniqueItems.push(item);
  }

  return uniqueItems.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    return byDate !== 0 ? byDate : a.description.localeCompare(b.description);
  });
}

function parseItauTransactions(raw, refMonth) {
  const skipDescription = /^(DATA|VALOR|ESTABELECIMENTO|TOTAL|SUBTOTAL|SALDO|LIMITE|JUROS|MULTA|IOF|ENCARGOS|LANÇAMENTOS|COMPRAS|SAQUES|PRODUTOS|SERVIÇOS|PRÓXIMA|ANUIDADE|DESCONTOS|CAIXA|DISPON[IÍ]VEL|UTILIZADO|CONTINUA|PAGAMENTO)/i;
  const categoryLine = /^(transporte|alimentacao|alimentação|sa[uú]de|educacao|educação|lazer|vestuario|vestuário|servicos|serviços|supermercado|restaurante|outros|farmacia|farmácia)\b/i;
  const paymentPattern = /\b(PAGAMENTO|PAGTO|PGTO|D[ÉE]BITO\s+AUTOM[ÁA]TICO|PAG\s+FATURA)\b/i;
  const summaryPattern = /\b(LIMITE|TOTAL\s+(DA|DESTA|DOS|PARA|LANÇAMENTOS|TRANS[AÁ]ÇÕES)|PR[ÓO]XIMA\s+FATURA|DEMAIS\s+FATURAS|VALOR\s+EM\s+R\$|CR[EÉ]DITO\s+ROTATIVO|ENCARGOS?\s+FINANCEIROS|JUROS\s+DO|JUROS\s+DE|MULTA\s+POR|IOF\s+DE)\b/i;
  const reversalPattern = /\b(ESTORNO|CR[ÉE]DITO|CREDITO|DEVOLU[CÇ][AÃ]O|REEMBOLSO|CANCELAMENTO)\b/i;
  const dateLine = /^\d{2}\/\d{2}$/;
  const moneyLine = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/;
  const items = [];
  const seen = new Set();
  const lines = raw.split('\n').map(line => line.trim()).filter(Boolean);
  let active = false;

  const isStopLine = (line) => /COMPRASPARCELADASPROXIMASFATURAS|LIMITESDECREDITO|ENCARGOSCOBRADOS|SIMULACAODECOMPRAS|NOVOTETODEJUROS|FIQUEATENTOAOSENCARGOS/.test(compactText(line));
  const isStartLine = (line) => /LANCAMENTOS(COMPRAS|PRODUTOSESERVICOS|PRODUTOS|INTERNACIONAIS|NOCARTAO)/.test(compactText(line));

  const addItem = (dateToken, rawDescription, amountText) => {
    let description = cleanDescription(rawDescription);
    if (!description || description.length < 3) return;

    description = description.replace(/\b\d{2}\/\d{2}\b/g, '').replace(/\s{2,}/g, ' ').trim();
    const compactDescription = compactText(description);

    if (!description || skipDescription.test(description)) return;
    if (paymentPattern.test(description) || summaryPattern.test(description)) return;
    if (/^(PAGAMENTO|PAGAMENTOS|TOTALDOSPAGAMENTOS|LIMITETOTALDECREDITO|LIMITEDISPONIVEL|LIMITETOTALUTILIZADO|PROXIMAFATURA|DEMAISFATURAS|TOTALPARAPROXIMASFATURAS|LANCAMENTOSNOCARTAO|LANCAMENTOSPRODUTOSESERVICOS)/.test(compactDescription)) return;
    if (isFinanceChargeItem(description)) return;

    let parcelCurrent = null;
    let parcelTotal = null;
    const parcelMatch = rawDescription.match(/(\d{1,2})\/(\d{1,2})/);
    if (parcelMatch) {
      parcelCurrent = Number(parcelMatch[1]);
      parcelTotal = Number(parcelMatch[2]);
    }

    const isReversal = reversalPattern.test(description) || amountText.startsWith('-');
    const amount = isReversal ? -Math.abs(brlToNumber(amountText)) : brlToNumber(amountText);
    if (!Number.isFinite(amount) || Math.abs(amount) > 20000) return;

    const date = resolveDate(dateToken, refMonth);
    const itemDate = new Date(`${date}T12:00:00`);
    const minDate = new Date(`${refMonth}-01T12:00:00`);
    minDate.setMonth(minDate.getMonth() - 2);
    if (itemDate < minDate && !parcelTotal && amount > 0) return;

    const key = `${date}|${descriptionFingerprint(description)}|${roundMoney(amount)}|${parcelCurrent || ''}|${parcelTotal || ''}`;
    if (seen.has(key)) return;
    seen.add(key);

    items.push({
      date,
      description,
      amount: roundMoney(amount),
      is_reversal: isReversal,
      parcel_current: parcelCurrent,
      parcel_total: parcelTotal,
    });
  };

  for (let i = 0; i < lines.length; i++) {
    if (isStopLine(lines[i])) active = false;
    if (isStartLine(lines[i])) {
      active = true;
      continue;
    }
    if (!active || !dateLine.test(lines[i])) continue;

    const dateToken = lines[i];
    const descParts = [];
    let amount = '';

    for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
      if (isStartLine(lines[j]) || isStopLine(lines[j])) break;
      if (dateLine.test(lines[j]) && descParts.length > 0 && !moneyLine.test(lines[j + 1] || '')) break;
      if (moneyLine.test(lines[j])) {
        amount = lines[j];
        break;
      }
      if (categoryLine.test(lines[j])) continue;
      if (isLikelyDescription(lines[j])) descParts.push(lines[j]);
    }

    if (amount && descParts.length) addItem(dateToken, descParts.join(' '), amount);
  }

  const activeBlocks = [];
  let currentBlock = [];
  active = false;

  for (const line of lines) {
    if (isStopLine(line)) {
      if (currentBlock.length) activeBlocks.push(currentBlock.join('\n'));
      currentBlock = [];
      active = false;
    }
    if (isStartLine(line)) {
      if (currentBlock.length) activeBlocks.push(currentBlock.join('\n'));
      currentBlock = [];
      active = true;
      continue;
    }
    if (active) currentBlock.push(line);
  }
  if (currentBlock.length) activeBlocks.push(currentBlock.join('\n'));

  for (const activeBlock of activeBlocks) {
    const inlineRegex = /(\d{2}\/\d{2})\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})(?=\s+\d{2}\/\d{2}\s+|\n|$)/g;
    let match;
    while ((match = inlineRegex.exec(activeBlock)) !== null) {
      const description = match[2].split(/\n/).filter(line => !categoryLine.test(line.trim())).join(' ');
      addItem(match[1], description, match[3]);
    }
  }

  return items.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    return byDate !== 0 ? byDate : a.description.localeCompare(b.description);
  });
}

function parseWithBestDeterministicCandidate(texts, refMonth, expectedTotal) {
  const candidates = [texts.streamText, texts.rowText, texts.columnText].map(text => {
    const parsedItems = dedupeItems(parseItauTransactions(text, refMonth));
    const total = roundMoney(parsedItems.reduce((sum, item) => sum + item.amount, 0));
    const diff = expectedTotal ? Math.abs(roundMoney(total - expectedTotal)) : 0;
    return { items: parsedItems, total, diff };
  });

  return candidates.sort((a, b) => a.diff - b.diff || b.items.length - a.items.length)[0];
}

function getFocusedInvoiceText(texts) {
  const stopRegex = /(Limites de crédito|Encargos cobrados|Simulação de Compras|Novo teto de juros|Fique atento aos encargos)/i;
  const sections = [];

  for (const [label, text] of [['ROW TEXT', texts.rowText], ['COLUMN TEXT', texts.columnText], ['STREAM TEXT', texts.streamText]]) {
    const normalized = String(text || '');
    const startIndexes = [];
    const startRegex = /Lanç\s*amentos|Lança\s*m\s*ent\s*os|L\s+Lançamentos atuais|Lançamentos atuais/gi;
    let match;

    while ((match = startRegex.exec(normalized)) !== null) {
      startIndexes.push(Math.max(0, match.index - 500));
    }

    if (!startIndexes.length) {
      sections.push(`--- ${label} ---\n${normalized.slice(0, 30000)}`);
      continue;
    }

    for (const start of startIndexes.slice(0, 8)) {
      const rest = normalized.slice(start, start + 35000);
      const stopMatch = rest.search(stopRegex);
      const excerpt = stopMatch > 2000 ? rest.slice(0, stopMatch + 1200) : rest;
      sections.push(`--- ${label} EXCERPT ---\n${excerpt}`);
    }
  }

  return sections.join('\n\n').slice(0, MAX_TEXT_CHARS_FOR_LLM);
}

async function extractWithLLMTextFallback(base44, texts, refMonth, expectedTotal) {
  const combinedText = getFocusedInvoiceText(texts);

  const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: `Você receberá texto extraído por pdfjs de uma fatura Itaú de cartão de crédito. Extraia somente os lançamentos atuais que compõem o total "Lançamentos atuais".

Mês de referência: ${refMonth}
Total esperado de "Lançamentos atuais": ${expectedTotal || 'não encontrado'}

Regras obrigatórias:
- Use somente o texto abaixo; não invente itens.
- Retorne somente itens dos blocos de lançamentos atuais, incluindo compras/saques, lançamentos no cartão, lançamentos internacionais e produtos/serviços/anuidade.
- Exclua pagamentos efetuados, total dos pagamentos, resumo da fatura, limite de crédito, simulações, encargos cobrados, juros, multa, IOF de financiamento e compras parceladas de próximas faturas.
- Inclua "Repasse de IOF" de transações internacionais quando aparecer no bloco internacional.
- Estornos, cancelamentos, créditos e devoluções devem ser negativos.
- Para parcelas, inclua somente a parcela atual que aparece nos lançamentos atuais.
- Retorne date no formato YYYY-MM-DD, resolvendo datas DD/MM com o mês de referência.
- A soma dos amounts deve ficar o mais próxima possível do total esperado.
- Confira cuidadosamente lançamentos em colunas paralelas: quando houver duas tabelas lado a lado, extraia os dois lados.
- Não pare no primeiro bloco; continue até "L Total dos lançamentos atuais" ou até antes de limites/encargos/simulações.

Texto extraído:
${combinedText}`,
    response_json_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              description: { type: 'string' },
              amount: { type: 'number' },
              is_reversal: { type: 'boolean' },
              parcel_current: { type: ['number', 'null'] },
              parcel_total: { type: ['number', 'null'] }
            },
            required: ['date', 'description', 'amount']
          }
        }
      },
      required: ['items']
    }
  });

  return dedupeItems((response.items || [])
    .map(item => normalizeItem(item, refMonth))
    .filter(item => item && item.description && !isFinanceChargeItem(item.description)));
}

async function getPayload(req) {
  const contentType = req.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('file');
    const refMonth = String(form.get('ref_month') || '');

    if (!file || typeof file.arrayBuffer !== 'function') {
      return { error: 'Arquivo PDF não enviado', status: 400 };
    }

    return {
      refMonth,
      buffer: new Uint8Array(await file.arrayBuffer()),
    };
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return { error: 'Payload JSON inválido', status: 400 };
  }

  const fileUrl = String(body.file_url || '');
  if (!fileUrl) return { error: 'Arquivo PDF não enviado', status: 400 };

  let parsedUrl;
  try {
    parsedUrl = new URL(fileUrl);
  } catch {
    return { error: 'file_url inválido', status: 400 };
  }

  if (parsedUrl.protocol !== 'https:') {
    return { error: 'file_url deve usar HTTPS', status: 400 };
  }

  const response = await fetch(fileUrl);
  if (!response.ok) return { error: 'Não foi possível baixar o PDF', status: 400 };

  return {
    refMonth: String(body.ref_month || ''),
    buffer: new Uint8Array(await response.arrayBuffer()),
  };
}

function buildResponse(status, method, expectedTotal, items, debug) {
  const extractedTotal = roundMoney(items.reduce((sum, item) => sum + item.amount, 0));
  const difference = expectedTotal === null || expectedTotal === undefined ? null : roundMoney(extractedTotal - expectedTotal);

  const response = {
    status,
    method,
    expected_total: expectedTotal,
    extracted_total: extractedTotal,
    difference,
    item_count: items.length,
    items,
  };

  if (debug) response.debug = debug;
  return response;
}

function shouldAcceptFallback(parserItems, parserDiff, fallbackItems, fallbackDiff) {
  if (!fallbackItems.length) return false;
  if (fallbackDiff >= parserDiff) return false;

  const minimumLength = parserItems.length * 0.8;
  if (fallbackItems.length < minimumLength) {
    return fallbackDiff <= 0.05;
  }

  return true;
}

Deno.serve(async (req) => {
  const startedAt = Date.now();

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await getPayload(req);
    nowLabel(startedAt, 'payload recebido');

    if (payload.error) {
      return Response.json({ error: payload.error }, { status: payload.status || 400 });
    }

    const { buffer, refMonth } = payload;
    if (!/^\d{4}-\d{2}$/.test(refMonth)) {
      return Response.json({ error: 'ref_month inválido. Use YYYY-MM.' }, { status: 400 });
    }

    const texts = await extractTextFromPDF(buffer);
    nowLabel(startedAt, 'pdfjs terminou');

    const expectedTotal = extractExpectedTotal(texts.streamText) || extractExpectedTotal(texts.rowText) || extractExpectedTotal(texts.columnText);
    nowLabel(startedAt, `expectedTotal encontrado (${expectedTotal ?? 'null'})`);

    const bestParser = parseWithBestDeterministicCandidate(texts, refMonth, expectedTotal);
    const parserItems = bestParser.items;
    const parserTotal = bestParser.total;
    const parserDiff = expectedTotal ? Math.abs(roundMoney(parserTotal - expectedTotal)) : 0;
    nowLabel(startedAt, `parser terminou (${parserItems.length} itens, diff ${parserDiff})`);

    if (expectedTotal && parserDiff <= 1) {
      nowLabel(startedAt, 'resposta final ok_fast');
      return Response.json(buildResponse('ok_fast', 'pdfjs_parser', expectedTotal, parserItems));
    }

    let finalItems = parserItems;
    let finalStatus = 'needs_review';
    let finalMethod = 'mixed_or_failed';

    if (expectedTotal) {
      nowLabel(startedAt, 'fallback LLM texto iniciou');
      const fallbackItems = await extractWithLLMTextFallback(base44, texts, refMonth, expectedTotal);
      const fallbackTotal = roundMoney(fallbackItems.reduce((sum, item) => sum + item.amount, 0));
      const fallbackDiff = Math.abs(roundMoney(fallbackTotal - expectedTotal));
      nowLabel(startedAt, `fallback LLM texto terminou (${fallbackItems.length} itens, diff ${fallbackDiff})`);

      if (shouldAcceptFallback(parserItems, parserDiff, fallbackItems, fallbackDiff)) {
        finalItems = fallbackItems;
        finalStatus = fallbackDiff <= 1 ? 'ok_llm_text' : 'needs_review';
        finalMethod = fallbackDiff <= 1 ? 'llm_text_fallback' : 'mixed_or_failed';
      }
    }

    const finalResponse = buildResponse(finalStatus, finalMethod, expectedTotal, finalItems, {
      stream_sample: texts.streamText.slice(0, 1200),
      row_sample: texts.rowText.slice(0, 1200),
      column_sample: texts.columnText.slice(0, 1200),
    });

    nowLabel(startedAt, `resposta final ${finalStatus}`);
    return Response.json(finalResponse);
  } catch (error) {
    console.error('[extractInvoicePDF] erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});