import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const INCOME_CATEGORIES = [
  { name: 'Plantões PJ', slug: 'plantoes_pj', color: '#22c55e' },
  { name: 'Salário', slug: 'salario', color: '#16a34a' },
  { name: 'Bolsas', slug: 'bolsas', color: '#84cc16' },
  { name: 'Rendimentos', slug: 'rendimentos', color: '#14b8a6' },
  { name: 'Extras', slug: 'extras', color: '#06b6d4' },
];

const TRANSFER_CATEGORIES = [
  { name: 'Transferência', slug: 'transferencia', color: '#64748b' },
  { name: 'Fatura', slug: 'fatura', color: '#475569' },
  { name: 'Investimento', slug: 'investimento', color: '#6366f1' },
  { name: 'Reembolso', slug: 'reembolso', color: '#8b5cf6' },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Apenas administradores podem executar esta migração.' }, { status: 403 });
    }

    const existingCategories = await base44.asServiceRole.entities.Category.list('name', 500);
    const bySlug = new Map(existingCategories.map((category) => [category.slug, category]));

    let updatedExpenses = 0;
    for (const category of existingCategories) {
      if (!category.type) {
        await base44.asServiceRole.entities.Category.update(category.id, { type: 'expense' });
        updatedExpenses += 1;
      }
    }

    let created = 0;
    let updated = 0;

    const upsertCategory = async (categoryData, type) => {
      const current = bySlug.get(categoryData.slug);
      const payload = { ...categoryData, type, active: true };

      if (current) {
        await base44.asServiceRole.entities.Category.update(current.id, payload);
        updated += 1;
      } else {
        const newCategory = await base44.asServiceRole.entities.Category.create(payload);
        bySlug.set(newCategory.slug, newCategory);
        created += 1;
      }
    };

    for (const category of INCOME_CATEGORIES) {
      await upsertCategory(category, 'income');
    }

    for (const category of TRANSFER_CATEGORIES) {
      await upsertCategory(category, 'transfer');
    }

    return Response.json({
      success: true,
      updated_existing_expenses: updatedExpenses,
      created_categories: created,
      updated_seed_categories: updated,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});