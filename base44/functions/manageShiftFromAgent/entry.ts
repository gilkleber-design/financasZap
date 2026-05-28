import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const normalizeDate = (value) => {
  if (!value) return null;
  return String(value).split('T')[0];
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const { action, shift_id, hospital_id, date, type, shift_kind, valor, notes, status } = payload;

    if (!action) {
      return Response.json({ error: 'action is required' }, { status: 400 });
    }

    if (action === 'create') {
      if (!hospital_id || !date || !type) {
        return Response.json({ error: 'hospital_id, date and type are required' }, { status: 400 });
      }

      const shift = await base44.entities.Shift.create({
        hospital_id,
        date: normalizeDate(date),
        type,
        shift_kind: shift_kind || 'regular',
        status: status || 'scheduled',
        valor: Number(valor || 0),
        notes: notes || undefined,
      });

      return Response.json({ success: true, action: 'create', shift });
    }

    if (action === 'update') {
      if (!shift_id) {
        return Response.json({ error: 'shift_id is required' }, { status: 400 });
      }

      const updateData = {
        ...(hospital_id ? { hospital_id } : {}),
        ...(date ? { date: normalizeDate(date) } : {}),
        ...(type ? { type } : {}),
        ...(shift_kind ? { shift_kind } : {}),
        ...(status ? { status } : {}),
        ...(valor !== undefined ? { valor: Number(valor || 0) } : {}),
        ...(notes !== undefined ? { notes: notes || undefined } : {}),
      };

      const shift = await base44.entities.Shift.update(shift_id, updateData);
      return Response.json({ success: true, action: 'update', shift });
    }

    if (action === 'delete') {
      if (!shift_id) {
        return Response.json({ error: 'shift_id is required' }, { status: 400 });
      }

      await base44.entities.Shift.delete(shift_id);
      return Response.json({ success: true, action: 'delete', shift_id });
    }

    return Response.json({ error: 'invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});