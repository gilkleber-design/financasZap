import { useState, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, Edit2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { isAfter, parseISO, isValid, isEqual } from 'date-fns';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function ImportInvoicePDFModal({ card, refMonth, onClose, onImported }) {
  const fileRef = useRef(null);
  const [step, setStep] = useState('upload'); 
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [invoiceTotalFromBank, setInvoiceTotalFromBank] = useState(0);

  // Usamos os dados do cadastro do cartão para a inteligência de data
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

      // Criamos a data de corte baseada no cadastro do cartão
      // Se a competência é 2026-02, e o fechamento é dia 05, a trava é 05/02/2026
      const closingDate = parseISO(`${refMonth.substring(0, 7)}-${cardClosingDay.toString().padStart(2, '0')}`);

      const extracted = (result.items || []).map((item, i) => {
        const desc = (item.description || '').toLowerCase();
        
        // 1. Tratamento de Sinais (Estornos)
        const isNegativeText = desc.includes('estorno') || desc.includes('cancelamento') || desc.includes('est pcls') || desc.includes('pagamento efetuado');
        let finalAmount = Math.abs(item.amount || 0);
        if (item.amount < 0 || isNegativeText) finalAmount = -Math.abs(finalAmount);

        // 2. Trava Automática por Data de Fechamento do Cadastro
        let isAfterClosing = false;
        if (item.date) {
            const itemDate = parseISO(item.date);
            if (isValid(itemDate)) {
                // Se a compra foi feita no dia do fechamento ou depois, vai para a próxima fatura
                isAfterClosing = isAfter(itemDate, closingDate) || isEqual(itemDate, closingDate);
            }
        }

        return {
          ...item,
          amount: finalAmount,
          _id: i,
          selected: !isAfterClosing, 
          is_future: isAfterClosing
        };
      });

      setItems(extracted);
      setStep('review');
    } catch (error) {
      toast.error('Erro no processamento');
      setStep('upload');
    }
  };

  const selectedTotal = useMemo(() => {
    return items.filter(it => it.selected).reduce((s, it) => s + (it.amount || 0), 0);
  }, [items]);

  const diffWithBank = Math.abs(selectedTotal - invoiceTotalFromBank);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto font-sora">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800 font-black uppercase tracking-tight">
            <FileText className="w-5 h-5 text-primary" />
            Importação Direta — {card.name}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="py-12 flex flex-col items-center gap-6">
             <div className="text-center space-y-1">
                <p className="text-sm font-bold text-slate-700">Fechamento configurado: Dia {cardClosingDay}</p>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Lançamentos a partir deste dia serão ignorados nesta fatura</p>
             </div>
             <div 
               className="w-full border-2 border-dashed border-slate-200 rounded-3xl p-12 flex flex-col items-center gap-4 cursor-pointer hover:bg-slate-50 hover:border-primary/40 transition-all" 
               onClick={() => fileRef.current?.click()}
             >
               <Upload className="w-12 h-12 text-slate-300" />
               <p className="text-sm font-black text-slate-500 uppercase tracking-tighter">Clique para subir o PDF</p>
             </div>
             <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e => handleFile(e.target.files[0])} />
          </div>
        )}

        {step === 'processing' && (
          <div className="py-24 flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Aplicando regras de negócio e travas de data...</p>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            {diffWithBank < 0.1 ? (
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex gap-3 items-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <p className="text-xs font-black text-emerald-700 uppercase">Valores conferidos com sucesso!</p>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <div className="text-[11px]">
                  <p className="font-black text-amber-700 uppercase">Discrepância Residual</p>
                  <p className="text-amber-600 font-medium">Diferença de {fmt(diffWithBank)}. Verifique se há pagamentos da fatura anterior no meio da lista.</p>
                </div>
              </div>
            )}

            <div className="divide-y border rounded-2xl bg-white overflow-hidden shadow-sm">
              {items.map((it, idx) => (
                <div key={idx} className={`flex items-center gap-3 px-4 py-3 ${it.selected ? 'bg-white' : 'bg-slate-50 opacity-40'}`}>
                  <input 
                    type="checkbox" 
                    checked={it.selected} 
                    onChange={() => setItems(prev => prev.map((item, i) => i === idx ? {...item, selected: !item.selected} : item))} 
                    className="w-4 h-4 accent-primary" 
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-xs font-bold uppercase truncate ${it.amount < 0 ? 'text-emerald-600' : 'text-slate-700'}`}>{it.description}</p>
                      {it.is_future && <Badge className="bg-slate-100 text-slate-500 text-[7px] h-3.5 border-none font-black">MÊS SEGUINTE</Badge>}
                    </div>
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-tighter">{it.date} • {it.category}</p>
                  </div>
                  <span className={`text-xs font-black min-w-[80px] text-right ${it.amount < 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {it.amount < 0 ? '+' : '-'} {fmt(Math.abs(it.amount))}
                  </span>
                </div>
              ))}
            </div>

            <div className="bg-slate-900 p-6 rounded-[2rem] text-white shadow-2xl">
               <div className="flex justify-between items-center px-2">
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-500">Valor no PDF</p>
                    <p className="text-lg font-black text-slate-300">{fmt(invoiceTotalFromBank)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase text-slate-500">Lançamentos Selecionados</p>
                    <p className={`text-2xl font-black ${diffWithBank < 0.1 ? 'text-emerald-400' : 'text-white'}`}>{fmt(selectedTotal)}</p>
                  </div>
               </div>
               <Button className="w-full mt-5 h-12 bg-white text-slate-900 font-black hover:bg-slate-100 rounded-xl transition-all" onClick={onImported}>
                  IMPORTAR PARA O FLUXO
               </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}