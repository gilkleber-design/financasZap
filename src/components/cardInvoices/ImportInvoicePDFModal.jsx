import { useState, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, Edit2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { isAfter, parseISO, isValid, isEqual, format, compareAsc } from 'date-fns';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function ImportInvoicePDFModal({ card, refMonth, onClose, onImported }) {
  const fileRef = useRef(null);
  const [step, setStep] = useState('upload'); 
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [invoiceTotalFromBank, setInvoiceTotalFromBank] = useState(0);

  // Puxa o dia de fechamento do cadastro do cartão (Regra de Negócio)
  const cardClosingDay = card.closing_day || 5; 

  const handleFile = async (file) => {
    if (!file || file.type !== 'application/pdf') return toast.error('Selecione um arquivo PDF');
    setStep('processing');

    try {
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      const response = await base44.functions.invoke('extractInvoicePDF', {
        file_url: uploadRes.file_url,
        ref_month: refMonth,
      });

      const result = response.data;
      if (!result?.items) throw new Error('IA não retornou dados.');
      
      setInvoiceTotalFromBank(result.integrity_check?.invoice_total || 0);

      // Define a data de corte (fechamento) baseada no cadastro
      const closingDate = parseISO(`${refMonth.substring(0, 7)}-${cardClosingDay.toString().padStart(2, '0')}`);

      let extracted = (result.items || []).map((item, i) => {
        const desc = (item.description || '').toLowerCase();
        
        // 1. Identificação de Estornos e Créditos
        const isNegativeText = desc.includes('estorno') || desc.includes('cancelamento') || desc.includes('est pcls') || desc.includes('pagamento efetuado');
        let finalAmount = Math.abs(item.amount || 0);
        if (item.amount < 0 || isNegativeText) finalAmount = -Math.abs(finalAmount);

        // 2. Lógica de Data, Trava de Fechamento e Formatação
        let isAfterClosing = false;
        let displayDate = item.date;
        let sortDate = item.date ? parseISO(item.date) : new Date(0);

        if (item.date) {
            const itemDate = parseISO(item.date);
            if (isValid(itemDate)) {
                // Bloqueia itens que pertencem à próxima fatura
                isAfterClosing = isAfter(itemDate, closingDate) || isEqual(itemDate, closingDate);
                displayDate = format(itemDate, 'dd/MM/yyyy');
                sortDate = itemDate;
            }
        }

        return {
          ...item,
          amount: finalAmount,
          date_display: displayDate,
          sort_date: sortDate,
          _id: i,
          selected: !isAfterClosing, 
          is_future: isAfterClosing
        };
      });

      // ORDENAÇÃO CRESCENTE POR DATA DE COMPRA
      extracted.sort((a, b) => compareAsc(a.sort_date, b.sort_date));

      setItems(extracted);
      setStep('review');
    } catch (error) {
      toast.error('Erro no processamento');
      setStep('upload');
    }
  };

  const selectedTotal = useMemo(() => {
    return items
      .filter(it => it.selected)
      .reduce((acc, it) => acc + (it.amount || 0), 0);
  }, [items]);

  const diffWithBank = Math.abs(selectedTotal - invoiceTotalFromBank);

  const handleImport = async () => {
    const { addMonths } = await import('date-fns');
    const selected = items.filter(it => it.selected);
    if (selected.length === 0) return toast.error('Selecione itens para importar');
    
    setSaving(true);

    try {
      const genGroupId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
      const processedGroups = new Set();
      const payables = [];
      const groupIds = {};

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
      toast.success('Fatura conciliada e importada!');
      setSaving(false);
      onImported();
      onClose();
    } catch (e) {
      toast.error('Erro ao salvar lançamentos');
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto font-sora text-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-black uppercase tracking-tight">
            <FileText className="w-5 h-5 text-primary" />
            Importação Inteligente — {card.name}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="py-10 flex flex-col items-center gap-6">
             <div className="text-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <p className="text-sm font-bold text-slate-700">Trava de Fechamento: Dia {cardClosingDay}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Lançamentos pós-fechamento serão movidos para o mês seguinte</p>
             </div>
             <div 
               className="w-full border-2 border-dashed border-slate-200 rounded-[2rem] p-12 flex flex-col items-center gap-4 cursor-pointer hover:bg-slate-50 transition-all" 
               onClick={() => fileRef.current?.click()}
             >
               <Upload className="w-10 h-10 text-slate-300" />
               <p className="text-sm font-black text-slate-500 uppercase">Subir PDF da Fatura</p>
             </div>
             <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e => handleFile(e.target.files[0])} />
          </div>
        )}

        {step === 'processing' && (
          <div className="py-24 flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Analisando cronologia e estornos...</p>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            <div className={`p-4 rounded-2xl border flex gap-3 items-center ${diffWithBank < 0.1 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              {diffWithBank < 0.1 ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <AlertCircle className="w-5 h-5 text-red-500" />}
              <div>
                <p className={`text-[11px] font-black uppercase ${diffWithBank < 0.1 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {diffWithBank < 0.1 ? 'Fatura Conciliada' : `Divergência: ${fmt(diffWithBank)}`}
                </p>
              </div>
            </div>

            <div className="divide-y border rounded-2xl bg-white overflow-hidden shadow-sm">
              {items.map((it, idx) => (
                <div key={idx} className={`flex items-center gap-4 px-4 py-3 ${it.selected ? 'bg-white' : 'bg-slate-50 opacity-40'}`}>
                  <input 
                    type="checkbox" 
                    checked={it.selected} 
                    onChange={() => setItems(prev => prev.map((item, i) => i === idx ? {...item, selected: !item.selected} : item))} 
                    className="w-4 h-4 accent-primary" 
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-xs font-bold uppercase truncate ${it.amount < 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                        {it.amount < 0 && '[ESTORNO] '} {it.description}
                      </p>
                      {it.is_future && <Badge className="bg-slate-200 text-slate-600 text-[7px] font-black border-none h-3.5 uppercase">Futuro</Badge>}
                    </div>
                    <p className="text-[9px] text-slate-400 font-black uppercase">{it.date_display} • {it.category}</p>
                  </div>
                  <span className={`text-xs font-black min-w-[90px] text-right ${it.amount < 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {it.amount < 0 ? '+' : '-'} {fmt(Math.abs(it.amount))}
                  </span>
                </div>
              ))}
            </div>

            <div className="bg-slate-900 p-6 rounded-[2rem] text-white shadow-2xl">
               <div className="flex justify-between items-center px-2">
                  <div>
                    <p className="text-[9px] font-black uppercase text-slate-500">Total PDF</p>
                    <p className="text-lg font-black text-slate-400">{fmt(invoiceTotalFromBank)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black uppercase text-slate-500">Total Selecionado</p>
                    <p className={`text-2xl font-black ${diffWithBank < 0.1 ? 'text-emerald-400' : 'text-white'}`}>{fmt(selectedTotal)}</p>
                  </div>
               </div>
               <Button className="w-full mt-5 h-12 bg-white text-slate-900 font-black hover:bg-slate-100 rounded-xl transition-all" onClick={handleImport} disabled={saving}>
                  {saving ? 'SALVANDO...' : 'CONFIRMAR IMPORTAÇÃO'}
               </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}