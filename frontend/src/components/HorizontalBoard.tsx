'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../contexts/I18nContext';

// Keep navigation above long columns, where the bottom scrollbar is off screen.
export function HorizontalBoard({ children, className = '', testId }: {
  children: ReactNode;
  className?: string;
  testId: string;
}) {
  const { language } = useI18n();
  const labels = language === 'fr'
    ? ['Faire défiler à gauche', 'Faire défiler à droite', 'Glissez le fond du tableau pour défiler', 'Défilement des colonnes']
    : language === 'es'
      ? ['Desplazar a la izquierda', 'Desplazar a la derecha', 'Arrastra el fondo del tablero para desplazarte', 'Desplazamiento de columnas']
      : ['Scroll left', 'Scroll right', 'Drag the board background to scroll', 'Scroll columns'];
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ pointerId: number; x: number; scrollLeft: number; moved: boolean } | null>(null);
  const edgeRef = useRef({ speed: 0, lastEvent: 0, frame: 0 });
  const [position, setPosition] = useState({ left: 0, max: 0 });
  const [panning, setPanning] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const sync = () => {
      setPosition({ left: viewport.scrollLeft, max: viewport.scrollWidth - viewport.clientWidth });
    };
    const wheel = (event: WheelEvent) => {
      // A non-passive listener is needed to prevent Firefox/Chrome scrolling twice.
      if (!event.deltaX && !event.shiftKey) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientWidth : 1;
      viewport.scrollLeft += (event.deltaX || event.deltaY) * unit;
    };
    const observer = new ResizeObserver(sync);
    observer.observe(viewport);
    observer.observe(content);
    viewport.addEventListener('scroll', sync);
    viewport.addEventListener('wheel', wheel, { passive: false });
    const stopEdgeScroll = () => {
      cancelAnimationFrame(edgeRef.current.frame);
      edgeRef.current = { speed: 0, lastEvent: 0, frame: 0 };
    };
    window.addEventListener('drop', stopEdgeScroll);
    window.addEventListener('dragend', stopEdgeScroll);
    sync();
    return () => {
      observer.disconnect();
      viewport.removeEventListener('scroll', sync);
      viewport.removeEventListener('wheel', wheel);
      stopEdgeScroll();
      window.removeEventListener('drop', stopEdgeScroll);
      window.removeEventListener('dragend', stopEdgeScroll);
    };
  }, []);

  const finishPan = () => { panRef.current = null; setPanning(false); };

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="mb-2 flex items-center gap-2">
        <button type="button" className="btn-secondary shrink-0 px-3 py-1" aria-label={labels[0]} title={labels[0]} disabled={position.left <= 1}
          onClick={() => viewportRef.current?.scrollBy({ left: -280 })}>←</button>
        <input type="range" data-testid={`${testId}-scrollbar`} aria-label={labels[3]} min={0} max={position.max} step={1} value={position.left}
          disabled={position.max <= 0} className="h-5 min-w-0 flex-1 cursor-pointer accent-lime-400"
          onChange={(event) => { if (viewportRef.current) viewportRef.current.scrollLeft = Number(event.currentTarget.value); }} />
        <button type="button" className="btn-secondary shrink-0 px-3 py-1" aria-label={labels[1]} title={labels[1]} disabled={position.left >= position.max - 1}
          onClick={() => viewportRef.current?.scrollBy({ left: 280 })}>→</button>
      </div>
      <div ref={viewportRef} data-testid={testId} title={labels[2]} className={`overflow-x-auto overscroll-x-contain pb-4 ${panning ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
        onDragOverCapture={(event) => {
          const viewport = event.currentTarget;
          const rect = viewport.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const edge = edgeRef.current;
          edge.speed = x < 56 ? -12 : x > rect.width - 56 ? 12 : 0;
          edge.lastEvent = performance.now();
          if (edge.frame || !edge.speed) return;
          const step = () => {
            if (!edge.speed || performance.now() - edge.lastEvent > 250) { edge.frame = 0; return; }
            viewport.scrollLeft += edge.speed;
            edge.frame = requestAnimationFrame(step);
          };
          edge.frame = requestAnimationFrame(step);
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== 'mouse' || event.button !== 0) return;
          // Native deal dragging and all controls retain their own interactions.
          if ((event.target as Element).closest('button, a, input, select, textarea, [role="button"], [draggable="true"]')) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          panRef.current = { pointerId: event.pointerId, x: event.clientX, scrollLeft: event.currentTarget.scrollLeft, moved: false };
        }}
        onPointerMove={(event) => {
          const pan = panRef.current;
          if (!pan || pan.pointerId !== event.pointerId) return;
          const delta = event.clientX - pan.x;
          if (!pan.moved && Math.abs(delta) < 4) return;
          pan.moved = true;
          setPanning(true);
          event.currentTarget.scrollLeft = pan.scrollLeft - delta;
        }}
        onPointerUp={finishPan} onPointerCancel={finishPan} onLostPointerCapture={finishPan}>
        <div ref={contentRef} className="w-max min-w-full">{children}</div>
      </div>
    </div>
  );
}
