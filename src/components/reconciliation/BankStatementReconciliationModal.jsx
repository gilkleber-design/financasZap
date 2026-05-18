import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parse, parseISO, isValid, differenceInCalendarDays, startOfDay } from 'date-fns';
import { Check, FileUp, Loader2, Search, EyeOff, Undo2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// ... (Manter as funções auxiliares: normalize, toCents, formatCurrency, splitCsvLine, parseAmount, parseStatementDate, postProcessCsv, parseCsv)

export default function BankStatementReconciliationModal({ open, onOpenChange }) {
  const queryClient = useQueryClient();
  const [statementRows, setStatementRows] = useState([]);
  const [ignoredRows, setIgnoredRows] = useState({});
  const [manualMatches, setManualMatches] = useState({});
  const [showSummary, setShowSummary] = useState(false);

  const { data: transactions = [] } = useQuery({ queryKey: ['transactions'], queryFn: () => base44.entities.Transaction.list('-date', 1000), enabled: open });
  const { data: payables = [] } = useQuery({ queryKey: ['payables'], queryFn: () => base44.entities.Payable.list('-due_date', 500), enabled: open });
  const { data: receivables = [] } = useQuery({ queryKey: ['receivables'], queryFn: () => base44.entities.Receivable.list('-due_date', 500), enabled: open });

  const { candidates, reconciledTransactions } = useMemo(() => {
    const recs = transactions.filter(t => t.reconciled === true).map(t => ({ ...t, kind: 'transaction' }));
    const pendTxs = transactions.filter(t => t.reconciled !== true).map(t => ({ ...t, kind: 'transaction' }));
    const pendPays = payables.filter(p => ['pending', 'provisioned'].includes(p.status || 'pending')).map(p => ({ ...p, kind: 'payable' }));
    const pendRecs = receivables.filter(r => ['pending', 'provisioned'].includes(r.status || 'pending')).map(r => ({ ...r, kind: 'receivable' }));
    return { reconciledTransactions: recs, candidates: [...pendPays, ...pendRecs, ...pendTxs] };
  }, [payables, receivables, transactions]);

  const rows = useMemo(() => statementRows.map(row => {
      if (ignoredRows[row.id]) return { ...row, status: 'to_ignore' };
      const processed = reconciledTransactions.find(t => toCents(t.amount) === toCents(row.amount) && Math.abs(differenceInCalendarDays(parseISO(t.date), parseISO(row.date))) <= 4);
      if (processed) return { ...row, status: 'processed', match: processed };
      const match = manualMatches[row.id] || candidates.find(c => toCents(c.amount) === toCents(row.amount) && Math.abs(differenceInCalendarDays(parseISO(c.date || c.due_date), parseISO(row.date))) <= 4);
      return { ...row, status: match ? 'match' : 'orphan', match };
  }), [statementRows, candidates, reconciledTransactions, ignoredRows, manualMatches]);

  const summary = useMemo(() => ({
    toMatch: rows.filter(r => r.status === 'match').length,
    toCreate: rows.filter(r => r.status === 'orphan').length,
    toIgnore: rows.filter(r => r.status === 'to_ignore').length
  }), [rows]);

  const exec = useMutation({
    mutationFn: async () => {
      for (const row of rows.filter(r => r.status !== 'processed')) {
        if (row.status === 'to_ignore') await base44.entities.Transaction.create({ description: row.description, amount: row.amount, type: 'ignored', category: 'ignored', date: row.date, reconciled: true });
        else if (row.status === 'orphan') await base44.entities.Transaction.create({ description: row.description, amount: row.amount, type: row.type, date: row.date, reconciled: true });
        else if (row.status === 'match') {
            if (row.match.kind === 'transaction') await base44.entities.Transaction.update(row.match.id, { amount: row.amount, reconciled: true, type: row.type });
            else if (row.match.kind === 'payable') { 
                const tx = await base44.entities.Transaction.create({ description: row.description, amount: row.amount, type: 'expense', date: row.date, payable_id: row.match.id, reconciled: true });
                await base44.entities.Payable.update(row.match.id, { status: 'paid', amount: row.amount, transaction_id: tx.id });
            } else if (row.match.kind === 'receivable') {
                const tx = await base44.entities.Transaction.create({ description: row.description, amount: row.amount, type: 'income', date: row.date, receivable_id: row.match.id, reconciled: true });
                await base44.entities.Receivable.update(row.match.id, { status: 'paid', amount: row.amount, transaction_id: tx.id });
            }
        }
      }
    },
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Concluído!'); onOpenChange(false); }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Conciliação de Extrato</DialogTitle>
        </DialogHeader>
        
        <Input type="file" onChange={(e) => {
            const reader = new FileReader();
            reader.onload = (ev) => setStatementRows(parseCsv(ev.target.result));
            reader.readAsText(e.target.files[0], 'ISO-8859-1');
        }} />

        <div className="flex-1 overflow-y-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead colSpan={2}>Extrato</TableHead>
                        <TableHead colSpan={2}>Match no Sistema</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map(row => (
                        <TableRow key={row.id} className={row.status === 'processed' ? 'bg-slate-100' : ''}>
                            <TableCell>{row.description}</TableCell>
                            <TableCell>{formatCurrency(row.amount)}</TableCell>
                            <TableCell>{row.match?.description || '---'}</TableCell>
                            <TableCell>
                                <Button variant="ghost" onClick={() => setIgnoredRows({...ignoredRows, [row.id]: !ignoredRows[row.id]})}>
                                    {ignoredRows[row.id] ? <Undo2 /> : <EyeOff />}
                                </Button>
                                {row.status === 'orphan' && (
                                    <Popover>
                                        <PopoverTrigger><Search /></PopoverTrigger>
                                        <PopoverContent>
                                            <Command>
                                                <CommandInput />
                                                <CommandList>
                                                    {candidates.filter(c => (row.type === 'income' ? ['receivable', 'income'].includes(c.kind === 'transaction' ? c.type : 'receivable') : ['payable', 'expense'].includes(c.kind === 'transaction' ? c.type : 'payable'))).map(c => (
                                                        <CommandItem onSelect={() => setManualMatches({...manualMatches, [row.id]: c})}>{c.description}</CommandItem>
                                                    ))}
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>

        <DialogFooter>
          <Button onClick={() => setShowSummary(true)}>EXECUTAR CONCILIAÇÃO</Button>
        </DialogFooter>

        <Dialog open={showSummary} onOpenChange={setShowSummary}>
            <DialogContent>
                <DialogTitle>Confirmar Execução</DialogTitle>
                <p>{summary.toMatch} Matches | {summary.toCreate} Novos | {summary.toIgnore} Ignorados</p>
                <Button onClick={() => exec.mutate()}>CONFIRMAR</Button>
            </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}