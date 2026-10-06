// Действия отчётов: отметить отчёт открытым, чтобы уведомление на Хабе больше не приходило.
// Устроены как действия финансов — см. finance/actions.js.

export function reportActions({ setState }) {
  return {
    markReportSeen(ym) {
      setState(prev => ((prev.reportsSeen || []).includes(ym) ? prev : { ...prev, reportsSeen: [...(prev.reportsSeen || []), ym] }));
    },
  };
}
