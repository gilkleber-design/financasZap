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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Trash2, Building2, MessageSquare, CreditCard, Landmark, Tag, ChevronDown, ChevronUp, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';

import CategoryManager from '@/components/settings/CategoryManager';
import CategoryRuleManager from '@/components/settings/CategoryRuleManager';
import WorkspaceMembersPanel from '@/components/settings/WorkspaceMembersPanel';

export default function Settings() {
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState(null);
  const [openSections, setOpenSections] = useState({ members: false, sources: false, accounts: false, cards: true, rules: false, categories: false });

  // Controles de visibilidade dos formulários de "Novo"
  const [showNewSource, setShowNewSource] = useState(false);
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [showNewCard, setShowNewCard] = useState(false);

  const toggleSection = (section) => setOpenSections(p => ({ ...p, [section]: !p[section] }));

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  // --- ESTADOS DE FORMULÁRIO ---
  const [editingSourceId, setEditingSourceId] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'pj', bank: '', default_tax_rate: '0' });
  
  const [editingAccountId, setEditingAccountId] = useState(null);
  const [accountForm, setAccountForm] = useState({ name: '', type: 'corrente', bank: '' });

  const [editingCardId, setEditingCardId] = useState(null);
  const [cardForm, setCardForm] = useState({
    name: '', holder_name: '', type: 'credit', bank: '', closing_day: '', due_day: '',
    is_additional: false, principal_card_id: '', assigned_user_id: '',
  });

  const setCard = (k, v) => setCardForm(p => ({ ...p, [k]: v }));

  // --- DATA FETCHING ---
  const { data: allCards = [] } = useQuery({ queryKey: ['cards'], queryFn: () => base44.entities.Card.list() });
  const { data: members = [] } = useQuery({ queryKey: ['workspace_members'], queryFn: () => base44.entities.User.list(), enabled: currentUser?.role === 'admin' });
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => base44.entities.Account.list() });
  const { data: sources = [] } = useQuery({ queryKey: ['income_sources'], queryFn: () => base44.entities.IncomeSource.list() });

  const cards = currentUser?.role === 'admin' ? allCards : allCards.filter(c => !c.assigned_user_id || c.assigned_user_id === currentUser?.id);

  // --- MUTAÇÕES ---
  const upsertCard = useMutation({
    mutationFn: (data) => editingCardId ? base44.entities.Card.update(editingCardId, data) : base44.entities.Card.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setEditingCardId(null);
      setShowNewCard(false);
      setCardForm({ name: '', holder_name: '', type: 'credit', bank: '', closing_day: '', due_day: '', is_additional: false, principal_card_id: '', assigned_user_id: '' });
      toast.success('Cartão salvo!');
    }
  });

  const upsertAccount = useMutation({
    mutationFn: (data) => editingAccountId ? base44.entities.Account.update(editingAccountId, data) : base44.entities.Account.create(data),
    onSuccess: () => { queryClient.invalidateQueries(); setEditingAccountId(null); setShowNewAccount(false); setAccountForm({ name: '', type: 'corrente', bank: '' }); toast.success('Conta salva!'); }
  });

  const upsertSource = useMutation({
    mutationFn: (data) => editingSourceId ? base44.entities.IncomeSource.update(editingSourceId, data) : base44.entities.IncomeSource.create(data),
    onSuccess: () => { queryClient.invalidateQueries(); setEditingSourceId(null); setShowNewSource(false); setForm({ name: '', type: 'pj', bank: '', default_tax_rate: '0' }); toast.success('Fonte salva!'); }
  });

  const deleteEntity = (entity, id) => {
    base44.entities[entity].delete(id).then(() => { queryClient.invalidateQueries(); toast.success('Removido'); });
  };

  return (
    <div className="p-6 space-y-4 max-w-2xl pb-32 font-sora">
      <header className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold">Configurações</h1>
          <p className="text-muted-foreground text-sm">Gerenciamento do Workspace</p>
        </div>
      </header>

      {/* 1. MEMBROS */}
      <Collapsible open={openSections.members} onOpenChange={() => toggleSection('members')} className="border rounded-xl bg-card overflow-hidden shadow-sm">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full flex justify-between p-4 h-auto hover:bg-accent/50">
            <div className="flex items-center gap-2 font-bold text-slate-700"><Tag className="w-4 h-4 text-primary" /> Membros do Workspace</div>
            {openSections.members ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="p-4 pt-0 border-t">
          <WorkspaceMembersPanel currentUser={currentUser} />
        </CollapsibleContent>
      </Collapsible>

      {/* 2. FONTES DE RENDA */}
      <Collapsible open={openSections.sources} onOpenChange={() => toggleSection('sources')} className="border rounded-xl bg-card shadow-sm">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full flex justify-between p-4 h-auto">
            <div className="flex items-center gap-2 font-bold text-slate-700"><Building2 className="w-4 h-4 text-primary" /> Fontes de Renda</div>
            {openSections.sources ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="p-4 border-t space-y-4">
          <div className="flex justify-end"><Button size="sm" onClick={() => setShowNewSource(true)} disabled={showNewSource || editingSourceId}><Plus className="w-3 h-3 mr-1" /> Adicionar Fonte</Button></div>
          
          {(showNewSource || editingSourceId) && (
            <div className="p-4 bg-accent/20 rounded-lg space-y-3 border border-primary/10">
              <Label>{editingSourceId ? 'Editar Fonte' : 'Nova Fonte'}</Label>
              <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Nome da Fonte" />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => {setEditingSourceId(null); setShowNewSource(false)}}>Cancelar</Button>
                <Button className="flex-1" onClick={() => upsertSource.mutate({...form, active: true})}>{editingSourceId ? 'Atualizar' : 'Salvar'}</Button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {sources.map(s => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border">
                <span className="text-sm font-medium">{s.name}</span>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditingSourceId(s.id); setForm(s); }}><Pencil className="w-3 h-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => deleteEntity('IncomeSource', s.id)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* 3. CONTAS BANCÁRIAS */}
      <Collapsible open={openSections.accounts} onOpenChange={() => toggleSection('accounts')} className="border rounded-xl bg-card shadow-sm">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full flex justify-between p-4 h-auto">
            <div className="flex items-center gap-2 font-bold text-slate-700"><Landmark className="w-4 h-4 text-primary" /> Contas Bancárias</div>
            {openSections.accounts ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="p-4 border-t space-y-4">
          <div className="flex justify-end"><Button size="sm" onClick={() => setShowNewAccount(true)} disabled={showNewAccount || editingAccountId}><Plus className="w-3 h-3 mr-1" /> Adicionar Conta</Button></div>
          
          {(showNewAccount || editingAccountId) && (
            <div className="p-4 bg-accent/20 rounded-lg space-y-3 border border-primary/10">
              <Label>{editingAccountId ? 'Editar Conta' : 'Nova Conta'}</Label>
              <Input value={accountForm.name} onChange={e => setAccountForm({...accountForm, name: e.target.value})} placeholder="Ex: Itaú Gil" />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => {setEditingAccountId(null); setShowNewAccount(false)}}>Cancelar</Button>
                <Button className="flex-1" onClick={() => upsertAccount.mutate({...accountForm, active: true})}>{editingAccountId ? 'Atualizar' : 'Salvar'}</Button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {accounts.map(a => (
              <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border">
                <span className="text-sm font-medium">{a.name}</span>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditingAccountId(a.id); setAccountForm(a); }}><Pencil className="w-3 h-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => deleteEntity('Account', a.id)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* 4. CARTÕES & ADICIONAIS */}
      <Collapsible open={openSections.cards} onOpenChange={() => toggleSection('cards')} className="border rounded-xl bg-card shadow-sm border-primary/20">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full flex justify-between p-4 h-auto">
            <div className="flex items-center gap-2 font-bold text-slate-700"><CreditCard className="w-4 h-4 text-primary" /> Cartões & Adicionais</div>
            {openSections.cards ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="p-4 border-t space-y-4">
          
          {/* LISTA DE CARTÕES VEM PRIMEIRO */}
          <div className="space-y-2">
            {cards.sort((a, b) => (b.principal_card_id === a.id ? -1 : a.principal_card_id === b.id ? 1 : 0)).map(c => (
              <div key={c.id} className={`flex items-center justify-between p-3 rounded-lg border transition-all ${c.is_additional ? 'bg-amber-50/40 ml-6 border-amber-100' : 'bg-white shadow-sm'}`}>
                <div className="flex items-center gap-3">
                  <CreditCard className={`w-4 h-4 ${c.is_additional ? 'text-amber-600' : 'text-primary'}`} />
                  <div>
                    <p className="text-sm font-bold">{c.name} {c.is_additional && <Badge className="ml-1 text-[9px] bg-amber-100 text-amber-700 hover:bg-amber-100 border-none">Adicional</Badge>}</p>
                    <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-tight">{c.holder_name}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditingCardId(c.id); setCardForm(c); setShowNewCard(true); }}><Pencil className="w-3 h-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => deleteEntity('Card', c.id)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center pt-2 border-t">
            <Button size="sm" variant="outline" onClick={() => { setShowNewCard(!showNewCard); setEditingCardId(null); }} className="w-full max-w-xs font-bold border-dashed border-primary text-primary hover:bg-primary/5">
              {showNewCard ? <><X className="w-4 h-4 mr-2"/> Fechar Formulário</> : <><Plus className="w-4 h-4 mr-2"/> Adicionar Novo Cartão</>}
            </Button>
          </div>

          {showNewCard && (
            <div className="border border-primary/20 rounded-xl p-4 space-y-4 bg-slate-50/50 animate-in fade-in zoom-in-95 duration-200">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Nome do Titular *</Label><Input value={cardForm.holder_name} onChange={e => setCard('holder_name', e.target.value)} placeholder="Como está no cartão" /></div>
                <div className={cardForm.is_additional ? "col-span-2" : "col-span-1"}><Label>Apelido *</Label><Input value={cardForm.name} onChange={e => setCard('name', e.target.value)} placeholder="Ex: Elo Gil" /></div>
                {!cardForm.is_additional && (<div><Label>Banco</Label><Input value={cardForm.bank} onChange={e => setCard('bank', e.target.value)} placeholder="Bradesco, Itaú..." /></div>)}

                <div className="col-span-2 flex items-center justify-between p-3 bg-white rounded-lg border">
                  <span className="text-sm font-medium">Este é um Cartão Adicional?</span>
                  <Switch checked={cardForm.is_additional} onCheckedChange={v => setCard('is_additional', v)} />
                </div>

                {cardForm.is_additional ? (
                  <div className="col-span-2"><Label>Vincular ao Cartão Principal</Label>
                    <Select value={cardForm.principal_card_id} onValueChange={v => setCard('principal_card_id', v)}>
                      <SelectTrigger className="bg-white"><SelectValue placeholder="Selecione o titular..." /></SelectTrigger>
                      <SelectContent>{allCards.filter(c => !c.is_additional).map(pc => (<SelectItem key={pc.id} value={pc.id}>{pc.name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                ) : (
                  <>
                    <div><Label>Dia Fechamento</Label><Input type="number" value={cardForm.closing_day} onChange={e => setCard('closing_day', e.target.value)} /></div>
                    <div><Label>Dia Vencimento</Label><Input type="number" value={cardForm.due_day} onChange={e => setCard('due_day', e.target.value)} /></div>
                  </>
                )}

                {currentUser?.role === 'admin' && (
                  <div className="col-span-2 border-t pt-2"><Label>Responsável no App</Label>
                    <Select value={cardForm.assigned_user_id || '_none'} onValueChange={v => setCard('assigned_user_id', v === '_none' ? '' : v)}>
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="_none">Todos</SelectItem>{members.map(m => (<SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setEditingCardId(null); setShowNewCard(false); }}>Cancelar</Button>
                <Button className="flex-1 font-bold" onClick={() => {
                  let data = { ...cardForm, active: true };
                  if (data.is_additional) {
                    const p = allCards.find(c => c.id === data.principal_card_id);
                    data = { ...data, bank: p?.bank, closing_day: p?.closing_day, due_day: p?.due_day };
                  }
                  upsertCard.mutate(data);
                }}>{editingCardId ? 'Atualizar' : 'Salvar'}</Button>
              </div>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* 5. REGRAS & CATEGORIAS */}
      <Collapsible open={openSections.rules} onOpenChange={() => toggleSection('rules')} className="border rounded-xl bg-card shadow-sm">
        <CollapsibleTrigger asChild><Button variant="ghost" className="w-full flex justify-between p-4 h-auto"><div className="flex items-center gap-2 font-bold text-slate-700"><Tag className="w-4 h-4 text-primary" /> Regras de Categorização</div>{openSections.rules ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}</Button></CollapsibleTrigger>
        <CollapsibleContent className="p-4 border-t"><CategoryRuleManager /></CollapsibleContent>
      </Collapsible>

      <Collapsible open={openSections.categories} onOpenChange={() => toggleSection('categories')} className="border rounded-xl bg-card shadow-sm">
        <CollapsibleTrigger asChild><Button variant="ghost" className="w-full flex justify-between p-4 h-auto"><div className="flex items-center gap-2 font-bold text-slate-700"><Tag className="w-4 h-4 text-primary" /> Categorias Personalizadas</div>{openSections.categories ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}</Button></CollapsibleTrigger>
        <CollapsibleContent className="p-4 border-t"><CategoryManager /></CollapsibleContent>
      </Collapsible>

      {/* 6. WHATSAPP */}
      <Card className="border border-green-200 shadow-sm bg-green-50/30 overflow-hidden">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-2 rounded-lg"><MessageSquare className="w-5 h-5 text-green-600" /></div>
            <div>
              <p className="text-sm font-bold text-green-800">Integração WhatsApp</p>
              <p className="text-[10px] text-green-600">FinançasZap conectado</p>
            </div>
          </div>
          <a href={base44.agents.getWhatsAppConnectURL('financas_zap')} target="_blank" rel="noopener noreferrer">
            <Button size="sm" className="bg-green-600 hover:bg-green-700 font-bold border-none">Conectar</Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}