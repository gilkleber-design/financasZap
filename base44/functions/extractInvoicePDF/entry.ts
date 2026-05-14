import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import * as pdfjsLib from 'npm:pdfjs-dist@4.4.168/legacy/build/pdf.mjs';

async function extractTextFromPDF(buffer) {
  const loadingTask = pdfjsLib.getDocument({ data: buffer, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true });
  const pdf = await loadingTask.promise;
  const allLines = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Agrupa itens por linha (Y aproximado), ordena por X
    const byY = {};
    for (const item of content.items) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5]);
      if (!byY[y]) byY[y] = [];
      byY[y].push({ x: item.transform[4], str: item.str });
    }

    const sortedYs = Object.keys(byY).map(Number).sort((a, b) => b - a);
    for (const y of sortedYs) {
      const lineItems = byY[y].sort((a, b) => a.x - b.x);
      const lineStr = lineItems.map(it => it.str).join(' ').trim();
      if (lineStr) allLines.push(lineStr);
    }
  }

  return allLines.join('\n');
}

function parseItauTransactions(text) {
  const items = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const txPattern = /^(\d{2}\/\d{2})\s+(.*)\s+(\d[\d.]*,\d{2})$/;
  const installPattern = /^(.*?)\s+(\d{2})\/(\d{2})$/;

  let inFutureInstallments = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^Compras parceladas/.test(line)) { inFutureInstallments = true; i++; continue; }
    if (inFutureInstallments) { i++; continue; }

    if (
      /^DATA\s+(ESTABELECIMENTO|PRODUTOS|VALOR)/.test(line) ||
      /^Lançamentos/.test(line) ||
      /^Pagamentos efetuados/.test(line) ||
      /^Total/.test(line) ||
      /^Resumo da fatura/.test(line) ||
      /^continua\.\.\./.test(line)
    ) { i++; continue; }

    const txMatch = line.match(txPattern);
    if (txMatch) {
      let [, date, middle, valueStr] = txMatch;
      middle = middle.trim();
      let installNumber = null;
      let installTotal = null;

      const instMatch = middle.match(installPattern);
      if (instMatch) {
        middle = instMatch[1].trim();
        installNumber = parseInt(instMatch[2], 10);
        installTotal = parseInt(instMatch[3], 10);
      }

      const amount = parseFloat(valueStr.replace(/\./g, '').replace(',', '.'));
      let category = 'outros';

      const nextLine = lines[i + 1] || '';
      if (nextLine && nextLine[0] >= 'a' && nextLine[0] <= 'z') {
        const spaceIdx = nextLine.indexOf(' ');
        const rawCat = spaceIdx > 0 ? nextLine.substring(0, spaceIdx) : nextLine;
        category = mapCategory(rawCat);
        i++;
      }

      const [day, month] = date.split('/');
      items.push({
        date_day: day,
        date_month: month,
        description: middle,
        amount,
        category,
        installment_number: installNumber,
        installment_total: installTotal,
      });
    }

    i++;
  }

  return items;
}

function mapCategory(raw) {
  const t = (raw || '').toLowerCase();
  if (t === 'transporte') return 'transporte';
  if (t === 'supermercado') return 'supermercado';
  if (t === 'saúde' || t === 'saude') return 'saude';
  if (t === 'educacao' || t === 'educação') return 'educacao';
  if (t === 'lazer') return 'lazer';
  if (t === 'vestuário' || t === 'vestuario') return 'vestuario';
  if (t === 'serviços' || t === 'servicos') return 'servicos';
  if (t === 'restaurante') return 'restaurante';
  return 'outros';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { file_url, ref_month } = await req.json();

    const response = await fetch(file_url);
    const buffer = new Uint8Array(await response.arrayBuffer());
    const text = await extractTextFromPDF(buffer);

    const parsed = parseItauTransactions(text);

    const [refYear, refMonthNum] = ref_month.split('-').map(Number);

    const items = parsed.map(item => {
      const itemMonth = parseInt(item.date_month, 10);
      let year = refYear;
      if (itemMonth > refMonthNum) year = refYear - 1;

      const dateStr = `${year}-${item.date_month.padStart(2, '0')}-${item.date_day.padStart(2, '0')}`;

      return {
        description: item.description,
        amount: item.amount,
        date: dateStr,
        category: item.category,
        installment_number: item.installment_number,
        installment_total: item.installment_total,
      };
    });

    const invoice_total = items
      .filter(it => it.amount > 0)
      .reduce((s, it) => s + it.amount, 0);

    return Response.json({
      items,
      integrity_check: { invoice_total: Math.round(invoice_total * 100) / 100 },
      debug_text: text.substring(0, 500),
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});