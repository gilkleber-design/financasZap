import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Limpa sufixos geográficos, adquirentes e fragmentação de texto (espaços fantasmas)
 */
function sanitizeDescription(desc) {
  if (!desc) return desc;

  // 1. Remove espaços duplos ou triplos causados pelo PDF (Ex: G I L -> GIL)
  // Nota: Isso é feito de forma conservadora para não colar palavras reais
  let cleaned = desc.replace(/([A-Z])\s(?=[A-Z]\s|[A-Z]$)/g, '$1'); 

  const geoSuffixes = [
    /\s*SAO PAULO\s*BRA?$/i,
    /\s*SALVADOR\s*BRA?$/i,
    /\s*CURITIBA\s*BRA?$/i,
    /\s*VITORIA\s*DA\s*CO.*$/i,
    /\s*RIO DE JANEIRO\s*BRA?$/i,
    /\s*BELO HORIZONTE\s*BRA?$/i,
    /\s*BRASILIA\s*BRA?$/i,
    /\s*FORTALEZA\s*BRA?$/i,
    /\s*RECIFE\s*BRA?$/i,
    /\s*MANAUS\s*BRA?$/i,
    /\s*PORTO ALEGRE\s*BRA?$/i,
    /[A-Z]{3,}BRA$/,
    /[A-Z]{3,}BR$/,
    /\s+BRA$/i,
    /\s+BR$/i,
  ];

  cleaned = cleaned.trim();
  for (const re of geoSuffixes) {
    cleaned = cleaned.replace(re, '').trim();
  }
  return cleaned;
}

function extractInstallment(description) {
  const parenMatch = description.match(/\((\d{1,2})\/(\d{1,2})\)/);
  if (parenMatch) {
    const num = parseInt(parenMatch[1]);
    const total = parseInt(parenMatch[2]);
    if (num <= total && total > 1) return { number: num, total };
  }

  const endMatch = description.match(/\s(\d{1,2})\/(\d{2})\s*$/);
  if (endMatch) {
    const num = parseInt(endMatch[1]);
    const total = parseInt(endMatch[2]);
    if (num <= total && total > 1 && total <= 72) return { number: num, total };
  }

  return null;
}

function removeInstallmentPattern(description, inst) {
  let result = description.replace(/\s*\(\d{1,2}\/\d{1,2}\)\s*/g, ' ');
  if (inst) {
    const endPat = new RegExp(`\\s${inst.number}/${String(inst.total).padStart(2,'0')}\\s*$`);
    result = result.replace(endPat, '');
    const endPat2 = new RegExp(`\\s0?${inst.number}/${String(inst.total).padStart(2,'0')}\\s*$`);
    result = result.replace(endPat2, '');
  }
  return result.trim();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { file_url, ref_month } = await req.json();
    if (!file_url || !ref_month) return Response.json({ error: 'file_url e ref_month são obrigatórios' }, { status: 400 });

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Aja como um extrator de faturas bancárias de alta precisão. 
Sua tarefa é converter o PDF em uma lista limpa e profissional de gastos.

REGRAS DE OURO PARA LIMPEZA E ESTÉTICA:
1. FILTRO DE RUÍDO: SÓ extraia linhas que possuam uma DATA (DD/MM) e um VALOR. Ignore cabeçalhos, propagandas, limites de crédito e textos informativos.
2. RECONSTRUÇÃO DE TEXTO: O PDF pode vir com espaços entre letras (ex: "U B E R"). Você DEVE unir as letras para formar palavras normais ("UBER").
3. HIGIENE: Remova sufixos de cidades ou nomes de adquirentes do fim da descrição (ex: transforme "ATAKADAO SALVADOR BRA" em "ATAKADAO").
4. ESTORNOS E PAGAMENTOS: Linhas de "Pagamento", "Estorno", "Crédito" ou com sinal "-" ou "C" devem ter o campo 'amount' NEGATIVO.
5. PARCELAS: Se houver "01/10" no fim da descrição, extraia como installment_number=1 e installment_total=10.

INFERÊNCIA DE ANO (Referência: ${ref_month}):
- Se o mês da data extraída for maior que o mês de ${ref_month}, use o ano anterior.

RETORNO:
JSON com array "items" e o campo "invoice_total" (valor total da fatura).`,
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
      // Aplica a higienização de texto no nome do estabelecimento
      let desc = sanitizeDescription(item.description);
      
      const inst = (item.installment_number && item.installment_total) ?
        { number: item.installment_number, total: item.installment_total } :
        extractInstallment(desc);
    
      if (inst) {
        desc = removeInstallmentPattern(desc, inst);
      }

      return {
        description: desc,
        amount: item.amount || 0, 
        date: item.date || ref_month + '-01',
        category: item.category?.toLowerCase() || 'outros',
        installment_number: inst ? inst.number : null,
        installment_total: inst ? inst.total : null,
      };
    }).filter(item => item.amount !== 0);

    const totalExtracted = items.reduce((sum, item) => sum + item.amount, 0);
    const invoiceTotal = result?.invoice_total || totalExtracted;

    return Response.json({
      items,
      integrity_check: {
        is_consistent: Math.abs(invoiceTotal - totalExtracted) < 0.1,
        total_extracted: totalExtracted,
        invoice_total: invoiceTotal,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});