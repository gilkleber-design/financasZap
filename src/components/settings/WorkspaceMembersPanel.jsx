import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, Crown, User } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export default function WorkspaceMembersPanel({ currentUser }) {
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  const { data: members = [], refetch } = useQuery({
    queryKey: ['workspace_members'],
    queryFn: () => base44.entities.User.list(),
    enabled: currentUser?.role === 'admin',
  });

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return toast.error('Informe o e-mail');
    setInviting(true);
    try {
      await base44.users.inviteUser(inviteEmail.trim(), 'user');
      toast.success(`Convite enviado para ${inviteEmail}`);
      setInviteEmail('');
      refetch();
    } catch (err) {
      toast.error('Erro ao convidar: ' + (err?.message || 'tente novamente'));
    } finally {
      setInviting(false);
    }
  };

  if (currentUser?.role !== 'admin') return null;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          Membros do Workspace
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Convidar */}
        <div className="border border-primary/20 rounded-xl p-4 space-y-3 bg-accent/20">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Convidar Novo Membro</p>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="sr-only">E-mail</Label>
              <Input
                type="email"
                placeholder="email@exemplo.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleInvite()}
              />
            </div>
            <Button size="sm" onClick={handleInvite} disabled={inviting}>
              {inviting ? 'Enviando...' : 'Convidar'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Novos membros entram com permissão <strong>user</strong>. Apenas admins podem gerenciar.</p>
        </div>

        {/* Lista de membros */}
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">Nenhum membro encontrado.</p>
        ) : (
          <div className="space-y-2">
            {members.map(m => (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${m.role === 'admin' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                    {m.role === 'admin' ? <Crown className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{m.full_name || m.email}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </div>
                </div>
                <Badge variant={m.role === 'admin' ? 'default' : 'outline'} className="text-xs">
                  {m.role === 'admin' ? 'Admin' : 'Membro'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}