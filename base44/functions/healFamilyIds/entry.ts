import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const entitiesToHeal = [
            "Receivable", "Hospital", "Category", "Shift", "Payable", 
            "Transaction", "Card", "Account", "IncomeSource", 
            "Budget", "Recurrence", "CategoryRule", "CardInvoice"
        ];
        
        let count = 0;
        for (const ent of entitiesToHeal) {
            const records = await base44.asServiceRole.entities[ent].list();
            for (const r of records) {
               if (!r.family_id && r.created_by_id) {
                   await base44.asServiceRole.entities[ent].update(r.id, { family_id: r.created_by_id });
                   count++;
               }
            }
        }
        return Response.json({ success: true, healed: count });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});