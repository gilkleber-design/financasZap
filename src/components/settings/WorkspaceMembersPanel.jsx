import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Crown, User, Copy, Link as LinkIcon, Trash } from 'lucide-react';
import { toast } from 'sonner';

export default function WorkspaceMembersPanel({ currentUser }) {
  const { data: members = [], refetch } = useQuery({
    queryKey: ['workspace_members'],
    queryFn: async () => {
      const res = await base44.functions.invoke('listFamilyMembers', {});
      return res.data?.members || [];
    }
  });

  const handleCopyLink = () => {
    const link = `${window.location.origin}/hub-amarracao?family_invite=${currentUser?.family_id || currentUser?.id}`;
    navigator.clipboard.writeText(link);
    toast.success('Link de convite copiado!');
  };

  const handleRemove = async (memberId) => {
    if (!confirm('Remover membro da família?')) return;
    try {
      await base44.functions.invoke('removeFamilyMember', { member_id: memberId });
      toast.success('Membro removido com sucesso!');
      refetch();
    } catch (err) {
      toast.error('Erro ao remover: ' + (err?.response?.data?.error || err.message));
    }
  };

  const myFamilyId = currentUser?.family_id || currentUser?.id;
  const amIOwner = myFamilyId === currentUser?.id;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Minha Família
          </div>
          {amIOwner && (
            <Button size="sm" onClick={handleCopyLink} className="gap-2 shrink-0">
              <LinkIcon className="w-4 h-4" /> Copiar Link de Convite
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">Carregando membros...</p>
        ) : (
          <div className="space-y-2">
            {members.map(m => (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${m.is_owner ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                    {m.is_owner ? <Crown className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{m.full_name || m.email}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={m.is_owner ? 'default' : 'outline'} className="text-xs">
                    {m.is_owner ? 'Titular' : 'Membro'}
                  </Badge>
                  {amIOwner && !m.is_owner && (
                    <Button variant="ghost" size="icon" onClick={() => handleRemove(m.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 w-8">
                      <Trash className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}