import { useState, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, Trash2, Check, X, Edit2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { isAfter, endOfMonth, parseISO, isValid } from 'date-fns';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function ImportInvoicePDFModal({ card, refMonth, onClose, onImported }) {
  const fileRef = useRef(null);
  const [step, setStep] = useState('upload'); 
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [progress, setProgress] = useState(0);
  const [integrityCheck, setIntegrityCheck] = useState(null);

  const handleFile = async (file) => {
    if (!file || file.type !== 'application/pdf') return toast.error('Selecione um arquivo PDF');
    
    setStep('processing');
    setProgress(0);
    
    const progressInterval = setInterval(() => {
      setProgress(prev => (prev < 90 ? prev + 10 : prev));
    }, 500);

    try {
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      if (!uploadRes?.file_url) throw new Error('Falha no upload.');

      const response = await base44.functions.invoke('extractInvoicePDF', {
        file_url: uploadRes.file_url,
        ref_month: refMonth,
      });

      const result = response.data;
      clearInterval(progressInterval);
      setProgress(100);

      if (!result || !result.items) throw new Error('IA não retornou dados válidos.');

      // Data de corte para evitar gastos do mês seguinte na fatura atual
      const dateLimit = endOfMonth(new Date(refMonth + '-01T12:00:00'));
      
      const extracted = (result.items || []).map((item, i) => {
        const desc = (item.description || '').toLowerCase();
        
        // Garante que estornos e cancelamentos sejam valores negativos
        const isNegative = item.amount < 0 || desc.includes('estorno') || desc.includes('cancelamento') || desc.includes('est pcls');
        const finalAmount = isNegative ? -Math.abs(item.amount || 0) : Math.abs(item.amount || 0);

        // Verifica se o item pertence à próxima fatura
        let isFuture = false;
        if (item.date) {
            const parsedDate = parseISO(item.date);
            if (isValid(parsedDate)) {
                isFuture = isAfter(parsedDate, dateLimit);
            }
        }

        return {
          ...item,
          amount: finalAmount,
          _id: i,
          selected: !isFuture, // Desmarcado por padrão se for do mês seguinte
          is_future: isFuture
        };
      });

      setItems(extracted);
      setIntegrityCheck(result.integrity_check || null);
      setStep('review');

    } catch (error) {
      clearInterval(progressInterval);
      toast.error(error.message || 'Erro no processamento');
      setStep('upload');
    }
  };

  const toggleItem = (idx) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, selected: !it.selected } : it));
  };

  const startEdit = (idx) => {
    setEditingIdx(idx);
    setEditForm({ description: items[idx].description, amount: items[idx].amount });
  };

  const saveEdit = (idx) => {
    setItems(prev => prev.map((it, i) => i === idx
      ? { ...it, description: editForm.description, amount: parseFloat(editForm.amount) || it.amount }
      : it
    ));
    setEditingIdx(null);
  };

  const handleImport = async () => {
    const selected = items.filter(it => it.selected);
    if (selected.length === 0) return toast.error('Selecione itens');
    
    setSaving(true);
    const { addMonths } = await import('date-fns');
    const genGroupId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
    const processedGroups = new Set();
    const payables = [];
    const groupIds = {};

    try {
        selected.forEach(it => {
          const hasInst = it.installment_number && it.installment_total && it.installment_total > 1;
          const groupKey = hasInst ? `${it.description}|${it.installment_total}` : null;
          
          if (hasInst && !processedGroups.has(groupKey)) {
            if (!groupIds[groupKey]) groupIds[groupKey] = genGroupId();
            const startNum = it.installment_number;
            const totalCount = it.installment_total;
            const baseDate = new Date(refMonth + '-01T12:00:00');
            const monthlyAmount = it.amount;

            for (let num = startNum; num <= totalCount; num++) {
              const daysOffset = num - startNum;
              const futureDate = addMonths(baseDate, daysOffset);
              const futureDateStr = futureDate.toISOString().split('T')[0];
              payables.push({
                description: `${it.description} (${num}/${totalCount})`,
                amount: monthlyAmount,
                due_date: futureDateStr + 'T12:00:00',
                competencia: futureDateStr.substring(0, 7) + '-01',
                category: it.category || 'outros',
                status: 'provisioned',
                origin_id: card.id,
                origin_type: 'card',
                payment_modality: 'card_invoice',
                recurrent: false,
                installment_number: num,
                installment_count: totalCount,
                installment_total_amount: monthlyAmount * totalCount,
                installment_group_id: groupIds[groupKey],
              });
            }
            processedGroups.add(groupKey);
          } else if (!hasInst) {
            payables.push({
              description: it.description,
              amount: it.amount,
              due_date: (it.date || refMonth + '-01') + 'T12:00:00',
              competencia: refMonth + '-01',
              category: it.category || 'outros',
              status: 'provisioned',
              origin_id: card.id,
              origin_type: 'card',
              payment_modality: 'card_invoice',
              recurrent: false,
            });
          }
        });

        await base44.entities.Payable.bulkCreate(payables);
        toast.success('Importação realizada!');
        setSaving(false);
        setStep('done');
        onImported();
    } catch (e) {
        toast.error('Erro ao salvar lançamentos');
        setSaving(false);
    }
  };

  const selectedTotal = useMemo(() => {
    return items.filter(it => it.selected).reduce((s, it) => s + (it.amount || 0), 0);
  }, [items]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto font-sora text-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Revisar Lançamentos — {card.name}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-full border-2 border-dashed border-slate-200 rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:bg-slate-50 transition-all" onClick={() => fileRef.current?.click()}>
              <Upload className="w-10 h-10 text-slate-300" />
              <p className="text-sm font-bold text-slate-600">Arraste o PDF da fatura aqui</p>
            </div>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e => handleFile(e.target.files[0])} />
          </div>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
            <p className="text-sm font-black uppercase">A IA está lendo sua fatura...</p>
            <div className="w-full max-w-xs h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            {integrityCheck && (Math.abs(integrityCheck.diff) > 0.1) && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div className="text-[11px]">
                  <p className="font-black text-red-700 uppercase">Divergência de Valores</p>
                  <p className="text-red-600">Fatura: {fmt(integrityCheck.invoice_total)} | IA: {fmt(integrityCheck.total_extracted)}</p>
                </div>
              </div>
            )}

            <div className="divide-y divide-slate-100 border rounded-xl overflow-hidden bg-white shadow-sm">
              {items.map((it, idx) => (
                <div key={idx} className={`flex items-center gap-3 px-4 py-3 transition-colors ${it.selected ? 'bg-white' : 'bg-slate-50/50 opacity-40'}`}>
                  <input type="checkbox" checked={it.selected} onChange={() => toggleItem(idx)} className="w-4 h-4 accent-primary" />
                  
                  {editingIdx === idx ? (
                    <div className="flex-1 flex gap-2">
                        <Input value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} className="h-8 text-xs" />
                        <Input type="number" value={editForm.amount} onChange={e => setEditForm({...editForm, amount: e.target.value})} className="h-8 text-xs w-24" />
                        <Button size="sm" className="h-8" onClick={() => saveEdit(idx)}><Check className="w-3 h-3"/></Button>
                    </div>
                  ) : (
                    <>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <p className={`text-sm truncate font-bold uppercase ${it.amount < 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                                    {it.amount < 0 && '[ESTORNO] '} {it.description}
                                </p>
                                {it.is_future && <Badge className="bg-amber-100 text-amber-700 text-[8px] h-4 font-black">PRÓX. FATURA</Badge>}
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">{it.date} • {it.category}</p>
                        </div>
                        <span className={`text-sm font-black min-w-[90px] text-right ${it.amount < 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {it.amount < 0 ? '+' : '-'} {fmt(Math.abs(it.amount))}
                        </span>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300" onClick={() => startEdit(idx)}><Edit2 className="w-3.5 h-3.5" /></Button>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-slate-900 p-5 rounded-2xl text-white">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400">Total Selecionado</p>
                  <p className="text-2xl font-black">{fmt(selectedTotal)}</p>
                </div>
                <Button onClick={handleImport} disabled={saving || items.filter(i => i.selected).length === 0} className="bg-white text-slate-900 hover:bg-slate-100 font-black px-6 h-11">
                  {saving ? 'SALVANDO...' : 'CONFIRMAR IMPORTAÇÃO'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <CheckCircle2 className="w-16 h-16 text-emerald-500" />
            <p className="text-lg font-black uppercase">Importação Concluída!</p>
            <Button onClick={onClose} className="w-full h-12 font-bold bg-slate-900 text-white">CONCLUIR</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}