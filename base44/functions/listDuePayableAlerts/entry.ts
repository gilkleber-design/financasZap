import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const toDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const dates = [toDateString(today), toDateString(tomorrow)];
    const payables = await base44.entities.Payable.list('-due_date', 500);

    const alerts = payables
      .filter((item) => item.due_alert_whatsapp === true)
      .filter((item) => item.status === 'pending')
      .filter((item) => item.due_date)
      .map((item) => {
        const dueDate = String(item.due_date).split('T')[0];
        const timing = dueDate === dates[0] ? 'today' : dueDate === dates[1] ? 'tomorrow' : null;
        return timing ? { ...item, due_date: dueDate, timing } : null;
      })
      .filter(Boolean)
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));

    return Response.json({ success: true, alerts });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});