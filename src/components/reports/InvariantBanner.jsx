import { useState } from 'react';
import { AlertTriangle, AlertCircle, X, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function InvariantBanner({ invariantes }) {
  const [modal, setModal] = useState(null); // 'drift' | 'confronto' | null
  const navigate = useNavigate();

  if (!invariantes) return null;

  const { confrontoFecha, diferencaInexplicada, transacoesComDrift, payablesComDrift, categoriasOrfas } = invariantes;
  const hasDrift = transacoesComDrift?.length > 0 || payablesComDrift?.length > 0;
  const hasOrfas = categoriasOrfas?.length > 0;

  if (confrontoFecha && !hasDrift && !hasOrfas) return null;

  return (
    <>
      <div className="space-y-2">
        {hasDrift && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1 text-sm text-amber-800">
              <span className="font-semibold">{(transacoesComDrift?.length || 0) + (payablesComDrift?.length || 0)} registros com categoria divergente</span>
              {' '}— category_id e category (texto) apontam para categorias diferentes.
            </div>
            <button onClick={() => setModal('drift')} className="text-xs font-semibold text-amber-700 underline shrink-0">
              ver detalhes
            </button>
          </div>
        )}
        {!confrontoFecha && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            <div className="flex-1 text-sm text-red-800">
              <span className="font-semibold">Confronto não fecha:</span> diferença inexplicada de {fmt(diferencaInexplicada)}.
            </div>
            <button onClick={() => setModal('confronto')} className="text-xs font-semibold text-red-700 underline shrink-0">
              investigar
            </button>
          </div>
        )}
        {hasOrfas && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1 text-sm text-amber-800">
              <span className="font-semibold">{categoriasOrfas.length} {categoriasOrfas.length === 1 ? 'categoria órfã' : 'categorias órfãs'}</span>
              {' '}— parent_id aponta para categoria inexistente.
            </div>
          </div>
        )}
      </div>

      {/* Modal Drift */}
      {modal === 'drift' && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-slate-800">Registros com categoria divergente</h3>
              <button onClick={() => setModal(null)}><X className="w-4 h-4 text-slate-500" /></button>
            </div>
            <div className="overflow-y-auto divide-y p-4 space-y-0">
              {[...(transacoesComDrift || []).map(i => ({ ...i, tipo: 'transaction' })),
                ...(payablesComDrift || []).map(i => ({ ...i, tipo: 'payable' }))]
                .map(item => (
                  <div key={item.id} className="py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700 truncate">{item.description}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{item.drift?.reason}</div>
                    </div>
                    <div className="text-xs text-slate-500 shrink-0">{fmt(item.amount)}</div>
                    <button
                      onClick={() => navigate(`/${item.tipo === 'transaction' ? 'transacoes' : 'contas-pagar'}?id=${item.id}`)}
                      className="text-primary shrink-0"
                      title="Ir para o registro"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal Confronto */}
      {modal === 'confronto' && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Confronto não fecha</h3>
              <button onClick={() => setModal(null)}><X className="w-4 h-4 text-slate-500" /></button>
            </div>
            <p className="text-sm text-slate-600 mb-2">Diferença inexplicada: <strong className="text-red-600">{fmt(diferencaInexplicada)}</strong></p>
            <p className="text-xs text-slate-400">Verifique a aba Reconciliação para detalhes das categorias de diferença.</p>
          </div>
        </div>
      )}
    </>
  );
}