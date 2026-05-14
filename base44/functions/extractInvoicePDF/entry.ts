import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function normalizePdfText(text) {
  return text
    .normalize('NFC')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/Lan\s*[cç]\s*amentos/gi, 'Lançamentos')
    .replace(/Pr\s*[oó]\s*dutos/gi, 'Produtos')
    .replace(/Servi\s*[cç]\s*os/gi, 'Serviços')
    .replace(/Compras\s+e\s+Saques/gi, 'Compras e Saques')
    .replace(/\bs\s*[aá]\s*[uú]\s*de\b/gi, 'saúde')
    .replace(/vestu\s*[aá]\s*rio/gi, 'vestuário')
    .replace(/\n{3,}/g, '\n\n');
}

async function extractTextFromPDF(buffer) {
  const pdfjsLib = await import('npm:pdfjs-dist@4.4.168/legacy/build/pdf.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = false;

  const loadingTask = pdfjsLib.getDocument({
    data: buffer,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const pageTexts = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const middleX = viewport.width / 2;
    const columns = [[], []];

    for (const item of content.items) {
      const str = String(item.str || '').trim();
      if (!str) continue;

      const x = Math.round(item.transform[4]);
      const y = Math.round(item.transform[5]);
      const column = x < middleX ? columns[0] : columns[1];
      let row = column.find(r => Math.abs(r.y - y) <= 3);

      if (!row) {
        row = { y, items: [] };
        column.push(row);
      }

      row.items.push({ x, str });
    }

    const formatColumn = (rows) => rows
      .sort((a, b) => b.y - a.y)
      .map(row => row.items.sort((a, b) => a.x - b.x).map(it => it.str).join('  '))
      .join('\n');

    pageTexts.push(`${formatColumn(columns[0])}\n${formatColumn(columns[1])}`);
  }

  return normalizePdfText(pageTexts.join('\n--- PAGE BREAK ---\n'));
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
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseItauTransactions(raw, refMonth) {
  const blockStart = /(Lançamentos[:\s-]*(compras e saques|produtos e serviços)|Produtos e Serviços)/i;
  const startIndex = raw.search(blockStart);
  const source = startIndex >= 0 ? raw.slice(startIndex) : raw;
  const endIndex = source.search(/(Compras parceladas\s*-\s*pr[oó]ximas faturas|Pr[oó]xima fatura|Limites de cr[eé]dito|Encargos cobrados|Demonstrativo|Resumo da fatura)/i);
  const block = endIndex >= 0 ? source.slice(0, endIndex) : source;

  const txRegex = /(\d{2}\/\d{2})\s+(.+?)\s{2,}(-?\d{1,3}(?:\.\d{3})*,\d{2})(?=\s|$)/g;
  const skipDescription = /^(DATA|VALOR|ESTABELECIMENTO|TOTAL|SUBTOTAL|SALDO|LIMITE|JUROS|MULTA|IOF|ENCARGOS|LANÇAMENTOS|COMPRAS|SAQUES|PRODUTOS|SERVIÇOS|PRÓXIMA|ANUIDADE|DESCONTOS|CAIXA|DISPON[IÍ]VEL|UTILIZADO)/i;
  const paymentPattern = /\b(PAGAMENTO|PAGTO|PGTO|D[ÉE]BITO\s+AUTOM[ÁA]TICO|PAG\s+FATURA)\b/i;
  const reversalPattern = /\b(ESTORNO|CR[ÉE]DITO|CREDITO|DEVOLU[CÇ][AÃ]O|REEMBOLSO)\b/i;
  const items = [];
  let match;

  while ((match = txRegex.exec(block)) !== null) {
    const dateToken = match[1];
    let description = cleanDescription(match[2]);
    const amount = brlToNumber(match[3]);

    if (!description || description.length < 3) continue;
    if (skipDescription.test(description)) continue;
    if (paymentPattern.test(description)) continue;

    let parcelCurrent = null;
    let parcelTotal = null;
    const parcelMatch = description.match(/^(.*?)\s+(\d{1,2})\/(\d{1,2})$/);
    if (parcelMatch) {
      description = parcelMatch[1].trim();
      parcelCurrent = Number(parcelMatch[2]);
      parcelTotal = Number(parcelMatch[3]);
    }

    items.push({
      date: resolveDate(dateToken, refMonth),
      description,
      amount,
      is_reversal: amount < 0 || reversalPattern.test(description),
      parcel_current: parcelCurrent,
      parcel_total: parcelTotal,
    });
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

    const text = await extractTextFromPDF(buffer);
    const items = parseItauTransactions(text, refMonth);

    return Response.json({ items });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});