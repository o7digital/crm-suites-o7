'use client';

type WindowControlsProps = {
  onClose: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  isMinimized: boolean;
  isMaximized: boolean;
};

export function WindowControls({
  onClose,
  onMinimize,
  onToggleMaximize,
  isMinimized,
  isMaximized,
}: WindowControlsProps) {
  const isMac =
    typeof navigator !== 'undefined' &&
    /mac/i.test((navigator.platform || navigator.userAgent || '').toLowerCase());

  const controls = [
    {
      key: 'close',
      color: 'bg-red-500',
      label: 'Close window',
      onClick: onClose,
      symbol: isMac ? '' : 'x',
    },
    {
      key: 'minimize',
      color: 'bg-amber-400',
      label: isMinimized ? 'Restore window' : 'Minimize window',
      onClick: onMinimize,
      symbol: isMac ? '' : '_',
    },
    {
      key: 'maximize',
      color: 'bg-green-500',
      label: isMaximized ? 'Restore size' : 'Maximize window',
      onClick: onToggleMaximize,
      symbol: isMac ? '' : isMaximized ? 'o' : '+',
    },
  ];

  return (
    <div className="flex items-center gap-2">
      {controls.map((ctrl) => (
        <button
          key={ctrl.key}
          type="button"
          aria-label={ctrl.label}
          title={ctrl.label}
          onClick={ctrl.onClick}
          className={`flex h-3.5 w-3.5 items-center justify-center rounded-full ${ctrl.color} text-[9px] font-bold text-black/70 ring-1 ring-black/20 transition hover:brightness-110`}
        >
          {ctrl.symbol}
        </button>
      ))}
    </div>
  );
}
