// Двухстрочный вывод названия: "Отображаемое название" сверху (если задано), настоящее — мелким
// приглушённым текстом под ним. Без displayTitle — просто одна строка с настоящим названием, как
// было раньше (лишняя строка не появляется, когда показывать больше нечего).
export function LibraryTitle({ item, className, wrapperClassName }) {
  if (item.displayTitle && item.displayTitle.trim()) {
    return (
      <div className={wrapperClassName || "min-w-0"}>
        <div className={className}>{item.displayTitle}</div>
        <div className="text-[10px] text-zinc-600 truncate">{item.title}</div>
      </div>
    );
  }
  return <div className={className}>{item.title}</div>;
}
