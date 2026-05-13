import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Building2, MessageSquare, CreditCard, Landmark, Tag } from 'lucide-react';
import { toast } from 'sonner';

import CategoryManager from '@/components/settings/CategoryManager';
import CategoryRuleManager from '@/components/settings/CategoryRuleManager';
import WorkspaceMembersPanel from '@/components/settings/WorkspaceMembersPanel';

export default function Settings() {
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  // Estados dos Formulários
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'pj', bank: '', default_tax_rate: '', notes: '' });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountForm, setAccountForm] = useState({ name: '', type: 'corrente', bank: '' });
  const setAcc = (k, v) => setAccountForm(p => ({ ...p, [k]: v }));

  const [showCardForm, setShowCardForm] = useState(false);
  const [cardForm, setCardForm] = useState({
    name: '', 
    holder_name: '', 
    type: 'credit', 
    bank: '', 
    closing_day: '', 
    due_day: '',
    is_additional: false, 
    principal_card_id: '', 
    assigned_user_id: '',
  });
  const setCard = (k, v) => setCardForm(p => ({ ...p, [k]: v }));

  // Queries
  const { data: allCards = [] } = useQuery({
    queryKey: ['cards'],
    queryFn: () => base44.entities.Card.list(),
  });

  const cards = currentUser?.role === 'admin'
    ? allCards
    : allCards.filter(c => !c.assigned_user_id || c.assigned_user_id === currentUser?.id);

  const { data: members = [] } = useQuery({
    queryKey: ['workspace_members'],
    queryFn: () => base44.entities.User.list(),
    enabled: currentUser?.role === 'admin',
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => base44.entities.Account.list(),
  });

  const { data: sources = [] } = useQuery({
    queryKey: ['income_sources'],
    queryFn: () => base44.entities.IncomeSource.list(),
  });

  // Mutações
  const createCardMutation = useMutation({
    mutationFn: (data) => base44.entities.Card.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setShowCardForm(false);
      setCardForm({ name: '', holder_name: '', type: 'credit', bank: '', closing_day: '', due_day: '', is_additional: false, principal_card_id: '', assigned_user_id: '' });
      toast.success('Cartão adicionado!');
    },
  });

  const createAccountMutation = useMutation({
    mutationFn: (data) => base44.entities.Account.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setShowAccountForm(false);
      setAccountForm({ name: '', type: 'corrente', bank: '' });
      toast.success('Conta adicionada!');
    },
  });

  const createSourceMutation = useMutation({
    mutationFn: (data) => base44.entities.IncomeSource.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setShowForm(false);
      setForm({ name: '', type: 'pj', bank: '', default_tax_rate: '', notes: '' });
      toast.success('Fonte de renda criada!');
    },
  });

  const deleteCardMutation = useMutation({ mutationFn: (id) => base44.entities.Card.delete(id), onSuccess: () => queryClient.invalidateQueries() });
  const deleteAccountMutation = useMutation({ mutationFn: (id) => base44.entities.Account.delete(id), onSuccess: () => queryClient.invalidateQueries() });
  const deleteSourceMutation = useMutation({ mutationFn: (id) => base44.entities.IncomeSource.delete(id), onSuccess: () => queryClient.invalidateQueries() });

  return (
    <div className="p-6 space-y-6 max-w-2xl pb-24">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground text-sm">Gerencie seu workspace</p>
      </div>

      <WorkspaceMembersPanel currentUser={currentUser} />

      {/* FONTES DE RENDA */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" /> Fontes de Renda</CardTitle>
          <Button size="sm" onClick={() => setShowForm(!showForm)}><Plus className="w-4 h-4 mr-1" /> Adicionar</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {showForm && (
            <div className="border border-primary/20 rounded-xl p-4 space-y-3 bg-accent/20">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Nome *</Label><Input value={form.name} onChange={e => set('name', e.target.value)} /></div>
                <div><Label>Tipo</Label><Select value={form.type} onValueChange={v => set('type', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="clt">CLT</SelectItem><SelectItem value="pj">PJ</SelectItem></SelectContent></Select></div>
                <div><Label>Banco</Label><Input value={form.bank} onChange={e => set('bank', e.target.value)} /></div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowForm(false)} className="flex-1">Cancelar</Button>
                <Button size="sm" onClick={() => createSourceMutation.mutate({...form, active: true})} className="flex-1">Salvar</Button>
              </div>
            </div>
          )}
          {sources.map(s => (
            <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
              <div className="flex items-center gap-3">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium">{s.name} <span className="text-[10px] text-muted-foreground ml-2">({s.type.toUpperCase()})</span></span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => deleteSourceMutation.mutate(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* CONTAS BANCÁRIAS */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Landmark className="w-4 h-4 text-primary" /> Contas</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowAccountForm(!showAccountForm)}><Plus className="w-3.5 h-3.5 mr-1" /> Adicionar</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {showAccountForm && (
            <div className="border border-primary/20 rounded-xl p-4 space-y-3 bg-accent/20">
              <Label>Nome da Conta</Label>
              <Input value={accountForm.name} onChange={e => setAcc('name', e.target.value)} placeholder="Ex: Itaú Gil" />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowAccountForm(false)} className="flex-1">Cancelar</Button>
                <Button size="sm" onClick={() => createAccountMutation.mutate({...accountForm, active: true})} className="flex-1">Salvar</Button>
              </div>
            </div>
          )}
          {accounts.map(a => (
            <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
              <span className="text-sm font-medium">{a.name}</span>
              <Button variant="ghost" size="icon" onClick={() => deleteAccountMutation.mutate(a.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* CARTÕES */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2"><CreditCard className="w-4 h-4 text-primary" /> Cartões</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowCardForm(!showCardForm)}><Plus className="w-3.5 h-3.5 mr-1" /> Adicionar</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {showCardForm && (
            <div className="border border-primary/20 rounded-xl p-4 space-y-4 bg-accent/20 mb-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Nome do Titular (No plástico) *</Label><Input value={cardForm.holder_name} onChange={e => setCard('holder_name', e.target.value)} /></div>
                <div className={cardForm.is_additional ? "col-span-2" : "col-span-1"}><Label>Nome (Apelido) *</Label><Input value={cardForm.name} onChange={e => setCard('name', e.target.value)} /></div>
                {!cardForm.is_additional && (<div><Label>Banco</Label><Input value={cardForm.bank} onChange={e => setCard('bank', e.target.value)} /></div>)}

                <div className="col-span-2 flex items-center justify-between p-3 bg-white/50 rounded-lg border border-dashed border-primary/20">
                  <span className="text-sm font-medium">Este é um Cartão Adicional?</span>
                  <Switch checked={cardForm.is_additional} onCheckedChange={v => setCard('is_additional', v)} />
                </div>

                {cardForm.is_additional ? (
                  <div className="col-span-2">
                    <Label>Vincular ao Cartão Principal *</Label>
                    <Select value={cardForm.principal_card_id} onValueChange={v => setCard('principal_card_id', v)}>
                      <SelectTrigger className="mt-1 bg-white"><SelectValue placeholder="Selecione o titular..." /></SelectTrigger>
                      <SelectContent>{allCards.filter(c => !c.is_additional).map(pc => (<SelectItem key={pc.id} value={pc.id}>{pc.name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                ) : (
                  <>
                    <div><Label>Fechamento (Dia)</Label><Input type="number" value={cardForm.closing_day} onChange={e => setCard('closing_day', e.target.value)} /></div>
                    <div><Label>Vencimento (Dia)</Label><Input type="number" value={cardForm.due_day} onChange={e => setCard('due_day', e.target.value)} /></div>
                  </>
                )}

                {/* CAMPO RESTAURADO: Responsável */}
                {currentUser?.role === 'admin' && members.length > 0 && (
                  <div className="col-span-2 border-t pt-3">
                    <Label>Responsável no App (Quem gerencia)</Label>
                    <Select value={cardForm.assigned_user_id || '_none'} onValueChange={v => setCard('assigned_user_id', v === '_none' ? '' : v)}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Todos (sem filtro)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">— Todos —</SelectItem>
                        {members.map(m => (<SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowCardForm(false)} className="flex-1">Cancelar</Button>
                <Button size="sm" onClick={() => {
                  if (!cardForm.name || !cardForm.holder_name) return toast.error('Nome e Titular obrigatórios');
                  let data = { ...cardForm, active: true };
                  if (cardForm.is_additional) {
                    const p = allCards.find(c => c.id === cardForm.principal_card_id);
                    data = { ...data, bank: p?.bank, closing_day: p?.closing_day, due_day: p?.due_day };
                  }
                  createCardMutation.mutate(data);
                }} disabled={createCardMutation.isPending} className="flex-1">Salvar</Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {cards.sort((a, b) => (b.principal_card_id === a.id ? -1 : a.principal_card_id === b.id ? 1 : 0)).map(c => {
               const owner = c.assigned_user_id ? members.find(m => m.id === c.assigned_user_id) : null;
               return (
                <div key={c.id} className={`flex items-center justify-between p-3 rounded-lg border ${c.is_additional ? 'bg-amber-50/30 border-amber-100 ml-6' : 'bg-muted/30 border-border font-medium'}`}>
                  <div className="flex items-center gap-3">
                    <CreditCard className={`w-4 h-4 ${c.is_additional ? 'text-amber-600' : 'text-primary'}`} />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm">{c.name}</p>
                        {c.is_additional && <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">Adicional</Badge>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {c.holder_name && <span className="text-[10px] font-bold uppercase text-muted-foreground bg-white px-1.5 py-0.5 rounded border">{c.holder_name}</span>}
                        {c.bank && <span className="text-xs text-muted-foreground">{c.bank}</span>}
                        {owner && <span className="text-[10px] text-blue-600 font-medium">@{owner.full_name?.split(' ')[0] || owner.email.split('@')[0]}</span>}
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteCardMutation.mutate(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <CategoryRuleManager />
      <CategoryManager />

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /> WhatsApp</CardTitle></CardHeader>
        <CardContent>
          <a href={base44.agents.getWhatsAppConnectURL('financas_zap')} target="_blank" rel="noopener noreferrer">
            <Button className="bg-green-600 hover:bg-green-700 text-white w-full">Conectar WhatsApp</Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}