import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let count = 0;
  
  for (let skip = 0; skip < 2000; skip += 100) {
    const payables = await base44.asServiceRole.entities.Payable.list('-created_date', 100, skip);
    if (payables.length === 0) break;
    
    for (const p of payables) {
      if (p.description && p.installment_group_id && p.description.includes('(') && p.description.includes('/')) {
        const newDesc = p.description.replace(/\s*\(\d+\/\d+\)\s*$/, '');
        if (newDesc !== p.description) {
          await base44.asServiceRole.entities.Payable.update(p.id, { description: newDesc });
          count++;
        }
      }
    }
  }
  
  return Response.json({ success: true, count });
});