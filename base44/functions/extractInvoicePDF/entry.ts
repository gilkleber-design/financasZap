import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import * as pdfjsLib from 'npm:pdfjs-dist@4.9.155/legacy/build/pdf.mjs';

// ─── Helpers de limpeza ─────────────────────────────────────────────────────

function sanitizeDescription(desc) {
  if (!desc) return desc;
  const geoSuffixes = [
    /\s*SAO PAULO\s*BRA?$/i, /\s*SALVADOR\s*BRA?$/i, /\s*CURITIBA\s*BRA?$/i,
    /\s*VITORIA\s*DA\s*CO.*$/i, /\s*RIO DE JANEIRO\s*BRA?$/i,
    /\s*BELO HORIZONTE\s*BRA?$/i, /\s*BRASILIA\s*BRA?$/i,
    /\s*FORTALEZA\s*BRA?$/i, /\s*RECIFE\s*BRA?$/i,
    /\s*MANAUS\s*BRA?$/i, /\s*PORTO ALEGRE\s*BRA?$/i,
    /[A-Z]{3,}BRA$/, /[A-Z]{3,}BR$/, /\s+BRA$/i, /\s+BR$/i,
  ];
  let cleaned = desc.trim();
  for (const re of geoSuffixes) cleaned = cleaned.replace(re, '').trim();
  return cleaned;
}

function categorizeByKeyword(desc) {
  const d = (desc || '').toUpperCase();
  if (/UBER|99APP|99 |CABIFY|POSTO|SHELL|IPIRANGA|PETROBRAS|COMBUSTIVEL|LATAM|GOL|AZUL|PASSAGEM/.test(d)) return 'transporte';
  if (/GOOGLE|APPLE|CAPCUT|NETFLIX|SPOTIFY|AMAZON|YOUTUBE|DISNEY|PARAMOUNT|HBO|ADAPTA/.test(d)) return 'servicos';
  if (/FARMACIA|DROGARIA|RAIA|PAGUE MENOS|ULTRAFARMA|HOSPITAL|CLINICA|LABORATORIO|PLANO|MENSALIDADE/.test(d)) return 'saude';
  if (/MERCADO|SUPERMERCADO|CARREFOUR|ATAKADAO|ATACADAO|HIPERIDEAL|IFOOD|RAPPI|RESTAURANTE|LANCHONETE|PADARIA/.test(d)) return 'alimentacao';
  if (/ESCOLA|UNIVERSIDADE|CURSO|UDEMY|ALURA|FACULDADE/.test(d)) return 'educacao';
  if (/IOF|TAXA|IMPOSTO|ENCARGO|MULTA|JUROS/.test(d)) return 'impostos';
  if (/HOTEL|AIRBNB|CINEMA|TEATRO|SHOW|INGRESSO|BOOKING/.test(d)) return 'lazer';
  if (/ROUPA|CALCADO|ZARA|RENNER|RIACHUELO/.test(d)) return 'vestuario';
  if (/ALUGUEL|CONDOMINIO|ENERGIA|AGUA|GAS|INTERNET|TELEFONE/.test(d)) return 'moradia';
  return 'outros';
}

// ─── Extração de texto bruto via pdfjs (agrupa tokens por linha Y) ────────────

async function extractLinesFromPDF(arrayBuffer) {
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    disableWorker: true,
    workerSrc: '',
  });
  const pdfDoc = await loadingTask.promise;
  const allLines = [];

  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page = await pdfDoc.getPage(p);
    const content = await page.getTextContent();

    const byY = new Map();
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] * 10) / 10;
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y).push({ x: item.transform[4], str: item.str });
    }

    const sortedYs = [...byY.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      const tokens = byY.get(y).sort((a, b) => a.x - b.x);
      const line = tokens.map(t => t.str).join(' ').replace(/\s+/g, ' ').trim();
      if (line) allLines.push(line);
    }
  }

  return allLines;
}

// ─── Inferência de ano ────────────────────────────────────────────────────────

function inferYear(dateStr, refMonth) {
  // dateStr = "DD/MM", refMonth = "YYYY-MM"
  const [refYear, refMon] = refMonth.split('-').map(Number);
  const mon = parseInt(dateStr.split('/')[1]);
  return mon > refMon ? refYear - 1 : refYear;
}

// ─── Extração via LLM (gemini_3_flash) ───────────────────────────────────────

async function extractWithLLM(base44, rawText, refMonth) {
  const systemPrompt = `Você é um extrator especialista de faturas de cartão de crédito brasileiras (Itaú).

REGRAS ABSOLUTAS:
1. Extraia TODOS os lançamentos que possuem data (DD/MM) e valor monetário.
2. ESTORNOS, DEVOLUÇÕES e "CANCELAMENTO DE COMPRA" DEVEM ser incluídos com amount NEGATIVO.
3. O lançamento "Pagamento efetuado" (pagamento da fatura anterior) DEVE ser incluído com amount NEGATIVO.
4. Lançamentos normais de compra têm amount POSITIVO.
5. CORRIJA as descrições fragmentadas pelo kerning do banco: junte sílabas e palavras partidas. Ex: "ATA KA DAO" → "ATAKADAO", "UBER *T RIP" → "UBER *TRIP", "STEL LA" → "STELLA". Use bom senso semântico.
6. Para datas, infira o ano: se o mês da transação for MAIOR que o mês de referência (${refMonth}), o ano é ${parseInt(refMonth.split('-')[0]) - 1}. Caso contrário, é ${parseInt(refMonth.split('-')[0])}.
7. Remova sufixos geográficos desnecessários das descrições (ex: "SAO PAULO BRA", "SALVADOR BA", "BRA", "BR").
8. Extraia o campo installment_number e installment_total quando houver parcelamento (ex: "06/12" = parcela 6 de 12). Se não houver parcelamento, retorne null.
9. NÃO inclua linhas de resumo, totais, limites, saldos, vencimentos ou cabeçalhos — apenas transações com data e valor.
10. Valores no texto usam formato brasileiro (1.234,56). Converta para número decimal (1234.56).

Retorne APENAS o JSON, sem markdown, sem explicações.`;

  const userPrompt = `Mês de referência da fatura: ${refMonth}

Texto bruto extraído do PDF (pode ter fragmentação de palavras por kerning):
---
${rawText}
---

Retorne um JSON com esta estrutura exata:
{
  "items": [
    {
      "date": "YYYY-MM-DD",
      "description": "descrição limpa",
      "amount": 123.45,
      "installment_number": null,
      "installment_total": null
    }
  ],
  "invoice_total": 123.45
}

"invoice_total" deve ser o total da fatura (campo "Total desta fatura" ou "Total da fatura").
Para lançamentos de pagamento ou estorno, amount deve ser NEGATIVO.`;

  const result = await base44.integrations.Core.InvokeLLM({
    model: 'gemini_3_flash',
    prompt: `${systemPrompt}\n\n${userPrompt}`,
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
              installment_number: { type: ['number', 'null'] },
              installment_total: { type: ['number', 'null'] },
            },
          },
        },
        invoice_total: { type: 'number' },
      },
    },
  });

  return result;
}

// ─── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { file_url, ref_month, debug } = await req.json();
    if (!file_url || !ref_month) return Response.json({ error: 'file_url e ref_month são obrigatórios' }, { status: 400 });

    const pdfResponse = await fetch(file_url);
    if (!pdfResponse.ok) throw new Error(`Falha ao baixar PDF: ${pdfResponse.status}`);
    const arrayBuffer = await pdfResponse.arrayBuffer();

    const lines = await extractLinesFromPDF(arrayBuffer);

    if (!lines || lines.length < 5) {
      throw new Error('Não foi possível extrair texto do PDF. Verifique se o arquivo não é uma imagem escaneada.');
    }

    if (debug) return Response.json({ debug_lines: lines });

    const rawText = lines.join('\n');

    // Delega ao LLM a interpretação semântica
    const llmResult = await extractWithLLM(base44, rawText, ref_month);

    const rawItems = llmResult?.items || [];

    // Pós-processamento: sanitize + categorize
    const items = rawItems.map(item => ({
      description: sanitizeDescription(item.description),
      amount: item.amount,
      date: item.date,
      category: categorizeByKeyword(item.description),
      installment_number: item.installment_number || null,
      installment_total: item.installment_total || null,
    }));

    const invoiceTotal = llmResult?.invoice_total || 0;
    const totalExtracted = items
      .filter(i => i.amount > 0) // só compras (não pagamentos/estornos) para conferência
      .reduce((sum, i) => sum + i.amount, 0);

    return Response.json({
      items,
      integrity_check: {
        is_consistent: invoiceTotal > 0 ? Math.abs(invoiceTotal - totalExtracted) < 1.0 : null,
        total_extracted: Math.round(totalExtracted * 100) / 100,
        invoice_total: invoiceTotal,
        diff: Math.round(Math.abs(invoiceTotal - totalExtracted) * 100) / 100,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});