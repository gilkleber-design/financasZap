import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function normalizePdfText(text) {
  return text
    .normalize('NFC')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/Lan\s*[cç]\s*amentos/gi, 'Lançamentos')
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
  const pdfjsModule = await import('npm:pdfjs-dist@3.11.174/legacy/build/pdf.js');
  const pdfjsLib = pdfjsModule.default || pdfjsModule;

  const loadingTask = pdfjsLib.getDocument({
    data: buffer,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const streamPages = [];
  const rowPages = [];

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

    streamPages.push(content.items.map(item => String(item.str || '').trim()).filter(Boolean).join('\n'));
    rowPages.push(rows
      .sort((a, b) => b.y - a.y)
      .map(row => row.items.sort((a, b) => a.x - b.x).map(it => it.str).join(' '))
      .join('\n'));
  }

  return {
    streamText: normalizePdfText(streamPages.join('\n--- PAGE BREAK ---\n')),
    rowText: normalizePdfText(rowPages.join('\n--- PAGE BREAK ---\n')),
  };
}

function brlToNumber(value) {
  return Number(String(value).replace(/\./g, '').replace(',', '.'));
}

function resolveDate(date, refMonth) {
  const [refYear, refMonthNum] = refMonth.split('-').map(Number);
  const [day, month] = date.split('/');
  const itemMonth = Number(month);
  const year = itemMonth > refMonthNum ? refYear - 1 : refYear;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function cleanDescription(description) {
  return description
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

function isSameTransaction(a, b) {
  if (a.date !== b.date || a.amount !== b.amount) return false;
  if ((a.parcel_current || '') !== (b.parcel_current || '')) return false;
  if ((a.parcel_total || '') !== (b.parcel_total || '')) return false;

  const aDesc = descriptionFingerprint(a.description);
  const bDesc = descriptionFingerprint(b.description);
  return aDesc === bDesc || aDesc.includes(bDesc) || bDesc.includes(aDesc);
}

function isLikelyDescription(line) {
  if (!line || line.length < 3) return false;
  if (/^\d{2}\/\d{2}$/.test(line)) return false;
  if (/^-?\d{1,3}(?:\.\d{3})*,\d{2}$/.test(line)) return false;
  if (/^(DATA|VALOR|ESTABELECIMENTO|TOTAL|SUBTOTAL|SALDO|LIMITE|JUROS|MULTA|IOF|ENCARGOS|LANÇAMENTOS|COMPRAS|SAQUES|PRODUTOS|SERVIÇOS|PRÓXIMA|ANUIDADE|DESCONTOS|CAIXA|DISPON[IÍ]VEL|UTILIZADO|CONTINUA)$/i.test(line)) return false;
  if (/^(transporte|alimentacao|alimentação|sa[uú]de|educacao|educação|lazer|vestuario|vestuário|servicos|serviços|supermercado|restaurante|outros|farmacia|farmácia)\b/i.test(line)) return false;
  return /[A-Za-zÀ-ÿ]/.test(line);
}

function parseItauTransactions(raw, refMonth) {
  const firstBlock = raw.search(/Lançamentos[:\s-]*(compras e saques|produtos e serviços)/i);
  const source = firstBlock >= 0 ? raw.slice(firstBlock) : raw;
  const endIndex = source.search(/Total dos lan[çc]amentos atuais|Compras parceladas\s*-\s*pr[oó]ximas faturas|Limites de cr[eé]dito|Encargos cobrados/i);
  const block = endIndex >= 0 ? source.slice(0, endIndex) : source;

  const skipDescription = /^(DATA|VALOR|ESTABELECIMENTO|TOTAL|SUBTOTAL|SALDO|LIMITE|JUROS|MULTA|IOF|ENCARGOS|LANÇAMENTOS|COMPRAS|SAQUES|PRODUTOS|SERVIÇOS|PRÓXIMA|ANUIDADE|DESCONTOS|CAIXA|DISPON[IÍ]VEL|UTILIZADO|CONTINUA)/i;
  const categoryLine = /^(transporte|alimentacao|alimentação|sa[uú]de|educacao|educação|lazer|vestuario|vestuário|servicos|serviços|supermercado|restaurante|outros|farmacia|farmácia)\b/i;
  const paymentPattern = /\b(PAGAMENTO|PAGTO|PGTO|D[ÉE]BITO\s+AUTOM[ÁA]TICO|PAG\s+FATURA)\b/i;
  const reversalPattern = /\b(ESTORNO|CR[ÉE]DITO|CREDITO|DEVOLU[CÇ][AÃ]O|REEMBOLSO)\b/i;
  const dateLine = /^\d{2}\/\d{2}$/;
  const moneyLine = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/;
  const items = [];
  const seen = new Set();
  const lines = block.split('\n').map(line => line.trim()).filter(Boolean);

  const addItem = (dateToken, rawDescription, amountText) => {
    let description = cleanDescription(rawDescription);
    if (!description || description.length < 3) return;
    if (skipDescription.test(description)) return;
    if (paymentPattern.test(description)) return;

    let parcelCurrent = null;
    let parcelTotal = null;
    const parcelMatch = description.match(/^(.*?)\s+(\d{1,2})\/(\d{1,2})$/);
    if (parcelMatch) {
      description = parcelMatch[1].trim();
      parcelCurrent = Number(parcelMatch[2]);
      parcelTotal = Number(parcelMatch[3]);
    }

    const isReversal = reversalPattern.test(description) || amountText.startsWith('-');
    const amount = isReversal ? -Math.abs(brlToNumber(amountText)) : brlToNumber(amountText);
    const date = resolveDate(dateToken, refMonth);
    const key = `${date}|${descriptionFingerprint(description)}|${amount}|${parcelCurrent || ''}|${parcelTotal || ''}`;
    if (seen.has(key)) return;
    seen.add(key);

    items.push({
      date,
      description,
      amount,
      is_reversal: isReversal,
      parcel_current: parcelCurrent,
      parcel_total: parcelTotal,
    });
  };

  for (let i = 0; i < lines.length; i++) {
    if (!dateLine.test(lines[i])) continue;
    const dateToken = lines[i];
    const descParts = [];
    let amount = '';

    for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
      if (dateLine.test(lines[j])) break;
      if (moneyLine.test(lines[j])) {
        amount = lines[j];
        break;
      }
      if (isLikelyDescription(lines[j])) descParts.push(lines[j]);
    }

    if (amount && descParts.length) addItem(dateToken, descParts.join(' '), amount);
  }

  const inlineRegex = /(\d{2}\/\d{2})\s+([^\n]+?)(?:\s+(-?\d{1,3}(?:\.\d{3})*,\d{2}))/g;
  let inlineMatch;
  while ((inlineMatch = inlineRegex.exec(block)) !== null) {
    addItem(inlineMatch[1], inlineMatch[2], inlineMatch[3]);
  }

  const txRegex = /(\d{2}\/\d{2})\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})(?=\s|\n|$)/g;
  let match;
  while ((match = txRegex.exec(block)) !== null) {
    const description = match[2].split(/\n/).filter(line => !categoryLine.test(line.trim())).join(' ');
    addItem(match[1], description, match[3]);
  }

  return items.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    return byDate !== 0 ? byDate : a.description.localeCompare(b.description);
  });
}

async function getPayload(req) {
  const contentType = req.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('file');
    const refMonth = form.get('ref_month');

    if (!file || typeof file.arrayBuffer !== 'function') {
      throw new Error('Arquivo PDF não enviado');
    }

    return {
      refMonth: String(refMonth || ''),
      buffer: new Uint8Array(await file.arrayBuffer()),
    };
  }

  const body = await req.json();
  if (!body.file_url) throw new Error('Arquivo PDF não enviado');

  const response = await fetch(body.file_url);
  if (!response.ok) throw new Error('Não foi possível baixar o PDF');

  return {
    refMonth: String(body.ref_month || ''),
    buffer: new Uint8Array(await response.arrayBuffer()),
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { buffer, refMonth } = await getPayload(req);
    if (!/^\d{4}-\d{2}$/.test(refMonth)) {
      return Response.json({ error: 'ref_month inválido' }, { status: 400 });
    }

    const { streamText, rowText } = await extractTextFromPDF(buffer);
    const items = [...parseItauTransactions(streamText, refMonth), ...parseItauTransactions(rowText, refMonth)];
    const uniqueItems = [];

    for (const item of items) {
      const existingIndex = uniqueItems.findIndex(existing => isSameTransaction(existing, item));
      if (existingIndex >= 0) {
        if (item.description.length > uniqueItems[existingIndex].description.length) {
          uniqueItems[existingIndex] = item;
        }
        continue;
      }
      uniqueItems.push(item);
    }

    uniqueItems.sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      return byDate !== 0 ? byDate : a.description.localeCompare(b.description);
    });

    const extractedTotal = Number(uniqueItems.reduce((sum, item) => sum + item.amount, 0).toFixed(2));

    return Response.json({ extracted_total: extractedTotal, items: uniqueItems });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});