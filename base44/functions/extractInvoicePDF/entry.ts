import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Limpa espaços fantasmas (G I L -> GIL) e sufixos de cidades
 */
function sanitizeDescription(desc) {
  if (!desc) return desc;
  let cleaned = desc.replace(/([A-Z])\s(?=[A-Z]\s|[A-Z]$)/g, '$1'); 
  const geoSuffixes = [/\s*SAO PAULO\s*BRA?$/i, /\s*SALVADOR\s*BRA?$/i, /[A-Z]{3,}BRA$/, /\s+BRA$/i, /\s+BR$/i];
  cleaned = cleaned.trim();
  for (const re of geoSuffixes) cleaned = cleaned.replace(re, '').trim();
  return cleaned;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { file_url, ref_month } = await req.json();

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Extraia os lançamentos desta fatura de cartão de crédito.
      Referência da Fatura: ${ref_month}.
      
      REGRAS DE EXTRAÇÃO:
      1. SÓ extraia se houver DATA (DD/MM) e VALOR. Ignore propagandas, limites e textos de ajuda.
      2. RECONSTRUÇÃO: Una letras separadas por espaços (ex: "U B E R" vira "UBER").
      3. PARCELAS: Identifique o padrão "01/10" ou semelhante. Retorne installment_number e installment_total.
      4. SINAL: Compras são positivas. Estornos, créditos e "Pagamento Efetuado" devem ter amount NEGATIVO.
      5. DATAS: Use o mês ${ref_month} para inferir o ano correto de cada DD/MM.`,
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
                installment_number: { type: 'number' },
                installment_total: { type: 'number' },
                category: { type: 'string' }
              },
              required: ['description', 'amount', 'date']
            }
          },
          invoice_total: { type: 'number' }
        }
      }
    });

    const items = (result.items || []).map(item => ({
      ...item,
      description: sanitizeDescription(item.description)
    }));

    return Response.json({ items, integrity_check: { invoice_total: result.invoice_total || 0 } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});