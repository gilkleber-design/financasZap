import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const toDateString = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toTimeString = (date) => {
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const today = toDateString(now);
    const tomorrowDate = new Date(now);
    tomorrowDate.setUTCDate(now.getUTCDate() + 1);
    const tomorrow = toDateString(tomorrowDate);
    const currentTime = toTimeString(now);

    const payables = await base44.entities.Payable.list('-due_date', 500);
    const alerts = [];

    for (const item of payables) {
      if (item.due_alert_whatsapp !== true) continue;
      if (item.status !== 'pending') continue;
      if (!item.due_date) continue;

      const dueDate = String(item.due_date).split('T')[0];

      if (dueDate === tomorrow) {
        alerts.push({
          id: item.id,
          description: item.description,
          amount: Number(item.amount || 0),
          due_date: dueDate,
          timing: 'day_before',
          send_slot: '08:00',
        });
        continue;
      }

      if (dueDate !== today) continue;

      let sendSlot = null;
      if (currentTime <= '11:00') sendSlot = '11:00';
      else if (currentTime <= '17:00') sendSlot = '17:00';
      else if (currentTime <= '23:00') sendSlot = '23:00';

      if (!sendSlot) continue;

      alerts.push({
        id: item.id,
        description: item.description,
        amount: Number(item.amount || 0),
        due_date: dueDate,
        timing: 'due_today',
        send_slot: sendSlot,
      });
    }

    alerts.sort((a, b) => a.due_date.localeCompare(b.due_date) || a.description.localeCompare(b.description, 'pt-BR'));

    const groupedMap = {};
    for (const item of alerts) {
      const key = `${item.timing}:${item.send_slot}`;
      if (!groupedMap[key]) {
        groupedMap[key] = {
          timing: item.timing,
          send_slot: item.send_slot,
          items: [],
        };
      }
      groupedMap[key].items.push(item);
    }

    return Response.json({
      success: true,
      groups: Object.values(groupedMap),
      alerts,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});