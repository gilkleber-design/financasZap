import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { MessageSquare, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import { toast } from 'sonner';

const defaultTimes = ['08:00', '11:00', '17:00', '23:00'];

export default function WhatsAppAlertsSection({ open, onToggle }) {
  const queryClient = useQueryClient();
  const [editingAlertId, setEditingAlertId] = useState(null);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me() });
  const { data: dueAlerts } = useQuery({ queryKey: ['due_alerts_preview'], queryFn: async () => (await base44.functions.invoke('listDuePayableAlerts', {})).data });
  const { data: payables = [] } = useQuery({ queryKey: ['payables_alerts'], queryFn: () => base44.entities.Payable.filter({ due_alert_whatsapp: true }, 'due_date', 200) });

  const [form, setForm] = useState({
    enabled: true,
    days_before: '1',
    times: defaultTimes.join(', '),
  });

  useMemo(() => {
    if (!me) return;
    setForm({
      enabled: me.whatsapp_alert_enabled !== false,
      days_before: String(me.whatsapp_alert_days_before ?? 1),
      times: (Array.isArray(me.whatsapp_alert_times) && me.whatsapp_alert_times.length > 0 ? me.whatsapp_alert_times : defaultTimes).join(', '),
    });
  }, [me]);

  const saveSettings = useMutation({
    mutationFn: async () => {
      const times = form.times.split(',').map((item) => item.trim()).filter(Boolean);
      return base44.auth.updateMe({
        whatsapp_alert_enabled: form.enabled,
        whatsapp_alert_days_before: Number(form.days_before || 1),
        whatsapp_alert_times: times,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      await queryClient.invalidateQueries({ queryKey: ['due_alerts_preview'] });
      toast.success('Configuração de alertas salva!');
    },
  });

  const updatePayable = useMutation({
    mutationFn: ({ id, due_alert_whatsapp }) => base44.entities.Payable.update(id, { due_alert_whatsapp }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['payables_alerts'] });
      await queryClient.invalidateQueries({ queryKey: ['due_alerts_preview'] });
      setEditingAlertId(null);
      toast.success('Alerta atualizado!');
    },
  });

  return (
    <Collapsible open={open} onOpenChange={onToggle} className="border rounded-xl bg-card shadow-sm">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full flex justify-between p-4 h-auto text-slate-700 font-bold">
          <div className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /> Alertas por WhatsApp</div>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="p-4 border-t space-y-4">
        <Card className="border-green-200 shadow-none bg-green-50/30">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-sm font-bold text-green-800">WhatsApp FinançasZap</p>
                <p className="text-[10px] text-green-600">Conectado</p>
              </div>
            </div>
            <a href={base44.agents.getWhatsAppConnectURL('financas_zap')} target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="bg-green-600 hover:bg-green-700 font-bold border-none">Conectar</Button>
            </a>
          </CardContent>
        </Card>

        <div className="space-y-4 rounded-xl border border-primary/10 bg-accent/20 p-4">
          <div className="flex items-center justify-between">
            <Label>Ativar alertas por WhatsApp</Label>
            <Switch checked={form.enabled} onCheckedChange={(value) => setForm((prev) => ({ ...prev, enabled: value }))} />
          </div>
          <div>
            <Label>Período de alerta (dias antes)</Label>
            <Input type="number" min="0" max="30" value={form.days_before} onChange={(e) => setForm((prev) => ({ ...prev, days_before: e.target.value }))} />
          </div>
          <div>
            <Label>Horários do dia</Label>
            <Input value={form.times} onChange={(e) => setForm((prev) => ({ ...prev, times: e.target.value }))} placeholder="08:00, 11:00, 17:00" />
            <p className="text-xs text-muted-foreground mt-1">Separe os horários por vírgula.</p>
          </div>
          <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>Salvar configuração</Button>
        </div>

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-bold">Alertas ativos</h3>
            <p className="text-xs text-muted-foreground">Contas marcadas para aviso no WhatsApp, com edição rápida.</p>
          </div>
          {payables.length === 0 ? (
            <div className="rounded-lg border bg-slate-50 p-3 text-sm text-muted-foreground">Nenhum alerta ativo.</div>
          ) : payables.map((item) => (
            <div key={item.id} className="rounded-lg border bg-white p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{item.description}</p>
                  <p className="text-xs text-muted-foreground">Vence em {String(item.due_date).split('T')[0]}</p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setEditingAlertId(editingAlertId === item.id ? null : item.id)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              </div>
              {editingAlertId === item.id && (
                <div className="flex items-center justify-between rounded-lg border bg-slate-50 p-3">
                  <Label>Receber alerta deste item</Label>
                  <Switch checked={item.due_alert_whatsapp === true} onCheckedChange={(value) => updatePayable.mutate({ id: item.id, due_alert_whatsapp: value })} />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-bold">Prévia dos próximos disparos</h3>
            <p className="text-xs text-muted-foreground">Baseado nas configurações atuais.</p>
          </div>
          {dueAlerts?.alerts?.length ? dueAlerts.alerts.slice(0, 20).map((alert) => (
            <div key={`${alert.id}-${alert.send_slot}-${alert.timing}`} className="rounded-lg border bg-slate-50 p-3 text-sm">
              <div className="font-medium">{alert.description}</div>
              <div className="text-xs text-muted-foreground">{alert.due_date} • {alert.send_slot}</div>
            </div>
          )) : <div className="rounded-lg border bg-slate-50 p-3 text-sm text-muted-foreground">Nenhum disparo previsto no momento.</div>}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}