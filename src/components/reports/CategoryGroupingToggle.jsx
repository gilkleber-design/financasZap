export default function CategoryGroupingToggle({ value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium">
      <button
        onClick={() => { onChange('leaf'); localStorage.setItem('relatorios_grouping', 'leaf'); }}
        className={`px-3 py-1.5 rounded-md transition-all ${value === 'leaf' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
      >
        Detalhado
      </button>
      <button
        onClick={() => { onChange('root'); localStorage.setItem('relatorios_grouping', 'root'); }}
        className={`px-3 py-1.5 rounded-md transition-all ${value === 'root' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
      >
        Agrupado por categoria-mãe
      </button>
    </div>
  );
}