import { CreditCard } from 'lucide-react';

export default function IncluirCartaoToggle({ value, onChange }) {
  const toggle = () => {
    const next = !value;
    onChange(next);
    localStorage.setItem('relatorios_incluir_cartao', String(next));
  };

  return (
    <button
      onClick={toggle}
      title="Mostra Provisionados de cartão como gasto da categoria — visão em tempo real"
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
        value
          ? 'bg-primary text-white border-primary'
          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
      }`}
    >
      <CreditCard className="w-3.5 h-3.5" />
      Incluir cartão
    </button>
  );
}