import ReconciliationConfront from './ReconciliationConfront.jsx';
import ReconciliationLists from './ReconciliationLists.jsx';

export default function ReconciliacaoTab({ data }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Por que a Atividade e as Contas a Pagar não fecham?</p>

      <ReconciliationConfront confronto={data.confronto} />

      <ReconciliationLists
        saiuSemObrigacao={data.saiuSemObrigacao}
        deviaMasNaoSaiu={data.deviaMasNaoSaiu}
        limbo={data.limbo}
      />
    </div>
  );
}