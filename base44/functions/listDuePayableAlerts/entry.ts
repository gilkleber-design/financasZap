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
    const currentTime = toTimeString(now);
    const alertEnabled = user.whatsapp_alert_enabled !== false;
    const alertDaysBefore = Number(user.whatsapp_alert_days_before ?? 1);
    const alertTimes = Array.isArray(user.whatsapp_alert_times) && user.whatsapp_alert_times.length > 0
      ? user.whatsapp_alert_times
      : ['08:00', '11:00', '17:00', '23:00'];

    if (!alertEnabled) {
      return Response.json({ success: true, groups: [], alerts: [], settings: { enabled: false, days_before: alertDaysBefore, times: alertTimes } });
    }

    const payables = await base44.entities.Payable.list('-due_date', 500);
    const alerts = [];

    for (const item of payables) {
      if (item.due_alert_whatsapp !== true) continue;
      if (item.status !== 'pending') continue;
      if (!item.due_date) continue;

      const dueDate = String(item.due_date).split('T')[0];
      const diffDays = Math.round((new Date(`${dueDate}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86400000);

      if (diffDays < 0 || diffDays > alertDaysBefore) continue;

      const sendSlots = diffDays === 0
        ? alertTimes.filter((time) => time >= currentTime)
        : alertTimes;

      const timing = diffDays === 0 ? 'due_today' : `days_before_${diffDays}`;

      for (const sendSlot of sendSlots) {
        alerts.push({
          id: item.id,
          description: item.description,
          amount: Number(item.amount || 0),
          due_date: dueDate,
          timing,
          send_slot: sendSlot,
        });
      }
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
      settings: {
        enabled: alertEnabled,
        days_before: alertDaysBefore,
        times: alertTimes,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});