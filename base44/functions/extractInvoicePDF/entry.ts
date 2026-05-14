import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function extractTextFromPDF(buffer) {
  const pdfjsLib = await import('npm:pdfjs-dist@4.4.168/legacy/build/pdf.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = false;

  const loadingTask = pdfjsLib.getDocument({ data: buffer, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true });
  const pdf = await loadingTask.promise;

  const pageTexts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join('\n');
    pageTexts.push(pageText);
  }

  return pageTexts.join('\n--- PAGE BREAK ---\n');
}

function parseItauTransactions(raw) {
  const items = [];

  const blockMatch = raw.match(/Lançamentos[:\s]+compras e saques[\s\S]*?(?=Próxima fatura|Limites de crédito|Encargos cobrados|$)/gi);
  const block = blockMatch ? blockMatch.join('\n') : '';

  if (!block) return items;

  const txRegex = /^(\d{2}\/\d{2})\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/gm;
  const installRegex = /^(.*?)\s+(\d{2})\/(\d{2})$/;

  let match;
  while ((match = txRegex.exec(block)) !== null) {
    let [, date, desc, valueStr] = match;
    desc = desc.trim();

    if (/^(Total|Pagamento|Saldo|Encargo|IOF|DATA|VALOR|Lançamentos|Próxima)/i.test(desc)) continue;

    let installNumber = null;
    let installTotal = null;
    const instMatch = desc.match(installRegex);
    if (instMatch) {
      desc = instMatch[1].trim();
      installNumber = parseInt(instMatch[2], 10);
      installTotal = parseInt(instMatch[3], 10);
    }

    const amount = parseFloat(valueStr.replace(/\./g, '').replace(',', '.'));
    const [day, month] = date.split('/');

    items.push({
      date_day: day,
      date_month: month,
      description: desc,
      amount,
      installment_number: installNumber,
      installment_total: installTotal,
    });
  }

  return items;
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
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});