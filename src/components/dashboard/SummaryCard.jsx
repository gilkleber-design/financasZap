import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const colorMap = {
  success: 'text-emerald-600 bg-emerald-50',
  destructive: 'text-red-500 bg-red-50',
  warning: 'text-amber-600 bg-amber-50',
  primary: 'text-primary bg-accent',
};

export default function SummaryCard({ title, value, grossValue, icon: Icon, color = 'primary' }) {
  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const showGross = grossValue && grossValue > value;

  return (
    <Card className="border border-white/20 bg-white/10 backdrop-blur-lg shadow-lg hover:bg-white/15 transition-all">
      <CardContent className="p-3 md:p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] md:text-xs font-medium text-muted-foreground uppercase tracking-wide leading-tight">{title}</p>
            <p className={cn(
              "text-base md:text-xl font-sora font-bold mt-1 truncate",
              color === 'success' ? 'text-emerald-600' :
              color === 'destructive' ? 'text-red-500' :
              color === 'warning' ? 'text-amber-600' : 'text-foreground'
            )}>
              {fmt(value)}
            </p>
            {showGross && (
              <p className="text-[10px] md:text-xs text-muted-foreground/60 mt-0.5 truncate">{fmt(grossValue)} bruto</p>
            )}
          </div>
          <div className={cn('p-1.5 md:p-2 rounded-lg flex-shrink-0 ml-1', colorMap[color] || colorMap.primary)}>
            <Icon className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}