import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function sanitizeDescription(desc) {
  if (!desc) return desc;
  // Remove espaços fantasmas (G I L -> GIL)
  let cleaned = desc.replace(/([A-Z])\s(?=[A-Z]\s|[A-Z]$)/g, '$1'); 
  const geoSuffixes = [
    /\s*SAO PAULO\s*BRA?$/i, /\s*SALVADOR\s*BRA?$/i, /\s*CURITIBA\s*BRA?$/i,
    /\s*VITORIA\s*DA\s*CO.*$/i, /\s*RIO DE JANEIRO\s*BRA?$/i,
    /\s*BELO HORIZONTE\s*BRA?$/i, /\s*BRASILIA\s*BRA?$/i,
    /\s*FORTALEZA\s*BRA?$/i, /\s*RECIFE\s*BRA?$/i,
    /\s*MANAUS\s*BRA?$/i, /\s*PORTO ALEGRE\s*BRA?$/i,
    /[A-Z]{3,}BRA$/, /[A-Z]{3,}BR$/, /\s+BRA$/i, /\s+BR$/i,
  ];
  cleaned = cleaned.trim();
  for (const re of geoSuffixes) cleaned = cleaned.replace(re, '').trim();
  return cleaned;
}

function extractInstallment(description) {
  const parenMatch = description.match(/\((\d{1,2})\/(\d{1,2})\)/);
  if (parenMatch) return { number: parseInt(parenMatch[1]), total: parseInt(parenMatch[2]) };
  const endMatch = description.match(/\s(\d{1,2})\/(\d{2,2})\s*$/);
  if (endMatch) return { number: parseInt(endMatch[1]), total: parseInt(endMatch[2]) };
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { file_url, ref_month } = await req.json();

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Aja como um extrator financeiro. 
      - SÓ extraia se houver DATA e VALOR. 
      - Una letras separadas (kerning). 
      - Estornos e Pagamentos: amount NEGATIVO.
      - Parcelas: Identifique formatos como 01/10 e preencha installment_number e installment_total.
      Referência: ${ref_month}`,
      file_urls: [file_url],
      response_json_schema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                amount: { type: 'number' },
                date: { type: 'string' },
                category: { type: 'string' },
                installment_number: { type: 'number' },
                installment_total: { type: 'number' },
              },
              required: ['description', 'amount', 'date', 'category'],
            },
          },
          invoice_total: { type: 'number' },
        },
        required: ['items'],
      },
    });

    const items = (result?.items || []).map(item => {
      let desc = sanitizeDescription(item.description);
      const inst = (item.installment_number && item.installment_total) 
        ? { number: item.installment_number, total: item.installment_total }
        : extractInstallment(item.description);

      return {
        ...item,
        description: desc,
        installment_number: inst?.number || null,
        installment_total: inst?.total || null,
      };
    }).filter(it => it.amount !== 0);

    return Response.json({
      items,
      integrity_check: {
        total_extracted: items.reduce((sum, it) => sum + it.amount, 0),
        invoice_total: result.invoice_total || 0,
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});