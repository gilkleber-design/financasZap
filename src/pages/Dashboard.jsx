import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Wallet, Coins, Scale, AlertTriangle, Home, Utensils, Car, Building, Users, Briefcase, MessageCircle, MoreHorizontal } from 'lucide-react';
import { format, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// --- HELPER FUNCTIONS ---

// Self-contained class name merger (replaces need for external lib/utils)
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Global currency formatting function for consistency
export const formatCurrency = (val, prefix = 'R$ ') => {
  if (typeof val !== 'number') return `${prefix}---`;
  return `${prefix}${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// --- MOCK DATA ---
const currentMonth = new Date(2026, 4, 1); // Maio 2026

const kpiCards = [
  {
    title: 'Saldo Real em Conta',
    value: 14500.00,
    subtitle: '(Baseado apenas em transações conciliadas)',
    icon: Wallet,
    color: 'emerald',
    customBg: true, // Special green background
  },
  {
    title: 'Meta de Receitas (Mês)',
    value: 8000.00,
    target: 12000.00,
    percentage: 66,
    icon: Coins,
    color: 'emerald',
  },
  {
    title: 'Saúde do Orçamento (Projetada)',
    value: 1500.00, // Projected balance
    healthPercent: 75, // Health indicator percentage
    icon: Scale,
    color: 'amber',
  },
  {
    title: 'A Cobrar / Vencidas',
    value: 950.00,
    count: 3,
    icon: AlertTriangle,
    color: 'rose',
    urgent: true, // Special pink background and urgent markers
  },
];

const expenseCategories = [
  { name: 'Moradia', icon: Home, color: '#3b82f6', teto: 4000.00, realizado: 3500.00, comprometido: 400.00 },
  { name: 'Alimentação', icon: Utensils, color: '#10b981', teto: 1500.00, realizado: 1150.00, comprometido: 100.00 },
  { name: 'Transporte', icon: Car, color: '#3b82f6', teto: 2000.00, realizado: 1500.00, comprometido: 400.00 },
];

const incomeCategories = [
  { name: 'Salário', icon: Building, color: '#10b981', meta: 8000.00, recebido: 8000.00, aReceber: 0.00 },
  { name: 'Cliente A', icon: Users, color: '#10b981', meta: 1500.00, recebido: 1200.00, aReceber: 300.00 },
  { name: 'Freelance', icon: Briefcase, color: '#10b981', meta: 2000.00, recebido: 1500.00, aReceber: 0.00 },
];

const overdueIncomes = [
  { date: '2026-05-20', description: 'Cliente X - Fatura #123', amount: 450.00 },
  { date: '2026-05-20', description: 'Cliente Y - Fatura #124', amount: 300.00 },
  { date: '2026-05-20', description: 'Cliente Z - Parcelamento B', amount: 200.00 },
];

const upcomingExpenses = [
  { date: '2026-05-27', description: 'Pagamento 01', amount: 2800.00 },
  { date: '2026-05-29', description: 'Pagamento 02', amount: 1150.00 },
  { date: '2026-05-29', description: 'Descrição Adicional', amount: 1500.00 },
  { date: '2026-05-27', description: 'Pagamento 03', amount: 2800.00 },
  { date: '2026-05-27', description: 'Pagamento 04', amount: 2800.00 },
];

// --- HELPER SUB-COMPONENTS ---

const CurrencyText = ({ value, prefix = 'R$ ' }) => (
  <span>{formatCurrency(value, prefix)}</span>
);

const ProgressBar = ({ value, Compromisso, max, className, showHashedCompromisso }) => {
  const valueWidth = max > 0 ? (value / max) * 100 : 0;
  const CompromissoWidth = max > 0 ? (Compromisso / max) * 100 : 0;

  return (
    <div className={cn("h-3.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden relative", className)}>
      {/* Valor Realizado (Sólido Verde/Azul) */}
      <div
        className={cn("h-full absolute left-0 top-0", showHashedCompromisso ? "bg-emerald-500" : "bg-blue-500")}
        style={{ width: `${valueWidth}%`, zIndex: 1 }}
      />
      
      {/* Valor Comprometido (Hashed Verde/Azul Claro) */}
      <div
        className={cn("h-full absolute top-0", showHashedCompromisso ? "bg-emerald-200" : "bg-blue-200")}
        style={{ width: `${CompromissoWidth}%`, left: `${valueWidth}%`, zIndex: 0 }}
      >
        {/* Camada Hashed opcional (apenas para Compromisso) */}
        {showHashedCompromisso && (
          <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,_transparent,_transparent_4px,_rgba(255,255,255,0.4)_4px,_rgba(255,255,255,0.4)_8px)]" />
        )}
      </div>
    </div>
  );
};

const HealthBar = ({ percentage }) => {
  const segments = [
    { color: 'bg-rose-500', limit: 20 },
    { color: 'bg-orange-500', limit: 40 },
    { color: 'bg-amber-500', limit: 60 },
    { color: 'bg-emerald-500', limit: 80 },
    { color: 'bg-emerald-600', limit: 100 },
  ];
  return (
    <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800 flex overflow-hidden relative border border-slate-200 dark:border-slate-700">
      {segments.map((s, i) => (
        <div key={i} className={cn("h-full flex-grow", s.color)} style={{ width: `calc(100% / ${segments.length})`}} />
      ))}
      {/* Indicador (Bolinha branca) */}
      <div
        className="absolute w-3 h-3 bg-white rounded-full border-2 border-slate-700 shadow top-1/2 -translate-y-1/2 -translate-x-1/2"
        style={{ left: `${percentage}%` }}
      />
    </div>
  );
};


// --- MAIN DASHBOARD PAGE ---

export default function DashboardPage() {

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 lg:space-y-8 bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold uppercase tracking-tight text-slate-950 dark:text-white">
            PAINEL DE CONTROLE
          </h1>
          <p className="text-muted-foreground text-sm uppercase tracking-wider font-semibold mt-1">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-slate-950 dark:bg-white text-white dark:text-slate-950 rounded-lg text-sm font-semibold shadow hover:opacity-90 transition-opacity">
          {/* Custom multi-colored plus icon approximation */}
          <span className="text-xl leading-none text-transparent bg-gradient-to-br from-green-400 via-blue-500 to-red-500 bg-clip-text">+</span>
          Novo Lançamento Rápido
        </button>
      </div>

      {/* KPI Cards Row (Monitor Multiparâmetro) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {kpiCards.map((card, index) => {
          const Icon = card.icon;
          const valueText = <CurrencyText value={card.value} />;

          if (card.customBg && card.color === 'emerald') {
            // Saldo Real
            return (
              <div key={index} className="rounded-3xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-5 flex gap-4 items-start shadow-sm">
                <div className="p-3 bg-white dark:bg-emerald-900 rounded-2xl border border-emerald-100">
                  <Icon className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{card.title}</p>
                  <p className="text-2xl lg:text-3xl font-bold text-slate-950 dark:text-white">{valueText}</p>
                  <p className="text-[11px] text-muted-foreground">{card.subtitle}</p>
                </div>
              </div>
            );
          }

          if (card.urgent) {
            // A Cobrar / Vencidas (Rose)
            return (
              <div key={index} className="rounded-3xl border-2 border-rose-200 bg-rose-50 dark:bg-rose-950/30 p-5 flex gap-4 items-start shadow-sm relative">
                {/* Warning Triangle indicator */}
                <Icon className="w-5 h-5 text-rose-500 absolute top-4 right-4" />
                <div className="p-3 bg-white dark:bg-rose-900 rounded-2xl border border-rose-100">
                  <Icon className="w-6 h-6 text-rose-600 dark:text-rose-400" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{card.title}</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl lg:text-3xl font-bold text-slate-950 dark:text-white">{card.count} <span className="text-base font-normal">receitas vencidas</span></p>
                  </div>
                  <p className="text-lg font-semibold text-slate-950 dark:text-white">{valueText}</p>
                  <p className="text-[11px] text-muted-foreground">urgentes para os próximos 7 dias</p>
                </div>
              </div>
            );
          }

          return (
            // Meta Receitas & Saúde Orçamento
            <div key={index} className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col gap-4 items-start shadow-sm relative">
              
              {/* More options button approximation */}
              <button className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                <MoreHorizontal className="w-5 h-5" />
              </button>
              
              <div className="flex gap-4 items-start">
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100">
                  <Icon className={`w-6 h-6 ${card.color === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{card.title}</p>
                  {card.title.includes('Saúde') ? (
                    <p className={`text-2xl font-bold ${card.value >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{card.value >= 0 ? '+' : ''}{valueText}</p>
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <p className="text-2xl lg:text-3xl font-bold text-slate-950 dark:text-white">{valueText}</p>
                      <span className="text-slate-400">/ <CurrencyText value={card.target} /></span>
                    </div>
                  )}
                </div>
              </div>

              {/* Barra de Progresso / Saúde */}
              {card.healthPercent !== undefined ? (
                <div className="w-full space-y-1">
                  <HealthBar percentage={card.healthPercent} />
                  <p className="text-[11px] text-right text-muted-foreground">índice saúde</p>
                </div>
              ) : (
                <div className="w-full space-y-1">
                  <ProgressBar value={card.value} Compromisso={0} max={card.target} showHashedCompromisso={card.percentage < 100} className="emerald-bars" />
                  <p className="text-[11px] text-right text-muted-foreground">{card.percentage}%</p>
                </div>
              )}
            </div>
          );
        })}
      </div>


      {/* Main Content (70/30 Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-[70%_30%] gap-6 lg:gap-8 items-start">
        
        {/* Esquerda: Raio-X Blocks */}
        <div className="space-y-6">
          {/* Raio-X de Despesas */}
          <Card className="p-0 overflow-hidden rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
            <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800 space-y-0.5">
              <CardTitle className="text-lg font-semibold text-slate-950 dark:text-white">Raio-X de Despesas</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <XRayTable categories={expenseCategories} type="despesa" />
            </CardContent>
          </Card>

          {/* Raio-X de Receitas */}
          <Card className="p-0 overflow-hidden rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
            <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800 space-y-0.5">
              <CardTitle className="text-lg font-semibold text-slate-950 dark:text-white">Raio-X de Receitas</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <XRayTable categories={incomeCategories} type="receita" />
            </CardContent>
          </Card>
        </div>

        {/* Direita: Sidebar Sections */}
        <div className="space-y-6">
          
          {/* Receitas Vencidas */}
          <SidebarBlock title="Receitas Vencidas / Cobranças Pendentes" urgentHeader={true}>
            <SidebarTable data={overdueIncomes} type="vencidas" urgent={true} />
          </SidebarBlock>

          {/* Próximos Vencimentos Despesas */}
          <SidebarBlock title="Próximos Vencimentos de Despesas">
            <SidebarTable data={upcomingExpenses} type="proximos" />
          </SidebarBlock>

        </div>
      </div>
    </div>
  );
}

// --- SHARED UI COMPONENTS (Approximation of local components if not using a library) ---

const Card = ({ children, className }) => (
  <div className={cn("bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm", className)}>
    {children}
  </div>
);

const CardHeader = ({ children, className }) => (
  <div className={cn("p-5 border-b border-slate-100 dark:border-slate-800", className)}>
    {children}
  </div>
);

const CardTitle = ({ children, className }) => (
  <h3 className={cn("text-lg font-semibold text-slate-950 dark:text-white", className)}>
    {children}
  </h3>
);

const CardContent = ({ children, className }) => (
  <div className={cn("p-5", className)}>
    {children}
  </div>
);


// --- X-RAY TABLE COMPONENT ---

const XRayTable = ({ categories, type }) => {
  const isExpense = type === 'despesa';
  const headerTarget = isExpense ? 'Teto (Planned)' : 'Meta (Planned)';
  const headerExec = isExpense ? 'Total Usado (Comprometido + Realizado)' : 'Total Recebido';

  return (
    <div className="w-full">
      {/* Table header */}
      <div className="grid grid-cols-[1fr,20%,30%] md:grid-cols-[1fr,15%,25%] gap-4 p-5 py-3 border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
        <span className="text-left">Categoria</span>
        <span>{headerTarget}</span>
        <span>{headerExec}</span>
      </div>
      
      {/* Table Body (Map categories) */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {categories.map((cat, i) => {
          const Icon = cat.icon;
          const target = isExpense ? cat.teto : cat.meta;
          const realizado = isExpense ? cat.realizado : cat.recebido;
          const Compromisso = isExpense ? cat.comprometido : cat.aReceber;
          const totalUsage = realizado + Compromisso;

          return (
            <div key={i} className="grid grid-cols-[1fr,20%,30%] md:grid-cols-[1fr,15%,25%] gap-x-4 p-5 py-4 items-center">
              
              {/* Category Cell */}
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                  <Icon className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                </div>
                <div className="flex-grow space-y-1">
                  <p className="font-semibold text-sm text-slate-950 dark:text-white">{cat.name}</p>
                  <ProgressBar value={realizado} Compromisso={Compromisso} max={target} showHashedCompromisso={isExpense || Compromisso > 0} className={isExpense ? "blue-bars" : "emerald-bars"} />
                </div>
              </div>

              {/* Target Cell */}
              <div className="text-sm font-semibold text-slate-950 dark:text-white text-right">
                <CurrencyText value={target} />
              </div>

              {/* Total Usage Cell */}
              <div className="text-sm font-bold text-slate-950 dark:text-white text-right">
                <CurrencyText value={totalUsage} />
              </div>

            </div>
          );
        })}
      </div>

      {/* Table Footer / Legend (Emerald) */}
      <div className="p-4 px-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-x-4 text-emerald-600 dark:text-emerald-400 font-medium">
        {/* Legend approximating the colors from image_4.png footer */}
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <div className="w-5 h-2 rounded bg-emerald-500" /> Realizado (Já foi Executado/Recebido)
        </div>
        <div className="flex items-center gap-1.5 text-sm font-semibold relative overflow-hidden">
          {/* Stacked approximation for legend hashed part */}
          <div className="w-5 h-2 rounded bg-emerald-200" />Comprometido (Projeção/Boletos Abertos)
          <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,_transparent,_transparent_2px,_rgba(255,255,255,0.4)_2px,_rgba(255,255,255,0.4)_4px)]" />
        </div>
        <div className="flex items-center gap-1.5 text-sm font-semibold">
           <div className="w-5 h-2 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200" /> Fundo (Meta de Faturamento/Teto)
        </div>
      </div>
    </div>
  );
};


// --- SIDEBAR BLOCK COMPONENT ---

const SidebarBlock = ({ title, urgentHeader, children }) => (
  <Card className="rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
    <CardHeader className={cn("p-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between", urgentHeader && "border-rose-100 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20")}>
      <CardTitle className={cn("text-base font-semibold", urgentHeader ? "text-rose-600 dark:text-rose-400" : "text-slate-950 dark:text-white")}>
        {title}
      </CardTitle>
      {urgentHeader && (
        <AlertTriangle className="w-5 h-5 text-rose-500" />
      )}
    </CardHeader>
    <CardContent className="p-0 divide-y divide-slate-100 dark:divide-slate-800">
      {children}
    </CardContent>
  </Card>
);

// --- SIDEBAR TABLE COMPONENT (Approximation of list items) ---

const SidebarTable = ({ data, type, urgent }) => {
  const isOverdueIncome = type === 'vencidas';

  return (
    <div>
       {/* List header (small) */}
       <div className={`grid grid-cols-[100px,1fr,auto] gap-x-3 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground ${urgent && "border-l-4 border-rose-500"}`}>
        <span>Data</span>
        <span>Descrição</span>
        <span>{isOverdueIncome ? '' : 'Montante'}</span>
      </div>

      {data.map((item, i) => {
        const dateObj = new Date(item.date);
        const formattedDate = format(dateObj, "dd/MM/yyyy");

        return (
          <div key={i} className={`grid grid-cols-[100px,1fr,auto] gap-x-3 px-5 py-3.5 items-center ${urgent && "border-l-4 border-rose-500 bg-rose-50/20 dark:bg-rose-950/10"}`}>
            
            {/* Date Cell */}
            <span className={`text-sm ${urgent ? "font-semibold text-slate-950 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>
              {formattedDate}
            </span>

            {/* Description Cell */}
            <div className={`flex items-center gap-1.5 text-sm ${urgent ? "font-semibold text-rose-600 dark:text-rose-400" : "font-medium text-slate-950 dark:text-white"}`}>
               {urgent && <AlertTriangle className="w-4 h-4 text-rose-500" />}
               <span className="truncate">{item.description}</span>
            </div>

            {/* Amount / Action Cell */}
            {isOverdueIncome ? (
               <button className="flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800 rounded-full text-xs font-semibold shadow hover:opacity-90">
                 <MessageCircle className="w-4 h-4 text-emerald-500" />
                 Cobrar via WhatsApp
               </button>
            ) : (
                <div className="flex items-center gap-2 text-right">
                    <span className="text-sm font-bold text-slate-950 dark:text-white"><CurrencyText value={item.amount} /></span>
                    <button className="flex items-center px-2.5 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold shadow hover:bg-slate-50 transition">
                         Dar Baixa
                    </button>
                </div>
            )}

          </div>
        );
      })}
    </div>
  );
};