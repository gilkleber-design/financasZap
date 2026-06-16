const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function ReconciliationConfront({ confronto }) {
  if (!confronto) return null;
  const { atividade, contasAPagar, diferenca } = confronto;
  const hasDiff = Math.abs(diferenca) > 0.01;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">Confronto do Mês</h3>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
        <div className="text-center flex-1">
          <div className="text-xs text-slate-400 mb-1">Atividade</div>
          <div className="text-2xl font-bold text-slate-800">{fmt(atividade)}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Transactions do mês</div>
        </div>
        <div className="text-slate-300 text-2xl font-light select-none">−</div>
        <div className="text-center flex-1">
          <div className="text-xs text-slate-400 mb-1">Contas a Pagar</div>
          <div className="text-2xl font-bold text-slate-800">{fmt(contasAPagar)}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Payables do mês</div>
        </div>
        <div className="text-slate-300 text-2xl font-light select-none">=</div>
        <div className={`text-center flex-1 rounded-xl px-4 py-3 ${hasDiff ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'}`}>
          <div className="text-xs text-slate-400 mb-1">Diferença</div>
          <div className={`text-2xl font-bold ${hasDiff ? (diferenca > 0 ? 'text-amber-600' : 'text-red-600') : 'text-emerald-600'}`}>
            {diferenca >= 0 ? '+' : ''}{fmt(diferenca)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {!hasDiff
              ? 'Atividade e Contas a Pagar batem'
              : diferenca > 0
                ? 'Atividade maior que Contas a Pagar — ver listas abaixo'
                : 'Contas a Pagar maior que Atividade — há compromissos não pagos'}
          </div>
        </div>
      </div>
    </div>
  );
}