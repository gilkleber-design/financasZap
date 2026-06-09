import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const { date, hospital_id } = payload;

    const query = {};
    if (date) query.date = String(date).split('T')[0];
    if (hospital_id) query.hospital_id = hospital_id;

    const shifts = Object.keys(query).length > 0
      ? await base44.entities.Shift.filter(query, 'date', 200)
      : await base44.entities.Shift.list('date', 200);

    const hospitals = await base44.entities.Hospital.list();
    const hospitalById = {};
    hospitals.forEach((h) => { hospitalById[h.id] = h; });

    return Response.json({
      success: true,
      shifts: shifts.map((shift) => ({
        id: shift.id,
        hospital_id: shift.hospital_id,
        hospital_name: hospitalById[shift.hospital_id]?.name || null,
        hospital_sigla: hospitalById[shift.hospital_id]?.sigla || null,
        date: shift.date,
        type: shift.type,
        shift_kind: shift.shift_kind,
        status: shift.status,
        valor: shift.valor,
        notes: shift.notes || null,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});