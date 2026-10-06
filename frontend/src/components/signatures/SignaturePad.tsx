"use client";
import { useRef } from "react";
export function SignaturePad({
  onChange,
  clearLabel,
}: {
  onChange: (image: string) => void;
  clearLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const ink = useRef(false);
  const position = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const c = event.currentTarget,
      r = c.getBoundingClientRect();
    return {
      x: ((event.clientX - r.left) * c.width) / r.width,
      y: ((event.clientY - r.top) * c.height) / r.height,
    };
  };
  return (
    <div>
      <canvas
        ref={canvasRef}
        width={700}
        height={220}
        className="w-full touch-none rounded-lg border border-slate-300 bg-white"
        aria-label="Handwritten signature"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const p = position(event),
            ctx = event.currentTarget.getContext("2d")!;
          ctx.strokeStyle = "#172033";
          ctx.lineWidth = 3;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          drawing.current = true;
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          const p = position(event),
            ctx = event.currentTarget.getContext("2d")!;
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ink.current = true;
        }}
        onPointerUp={() => {
          drawing.current = false;
          if (canvasRef.current && ink.current)
            onChange(canvasRef.current.toDataURL("image/png"));
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      />
      <button
        type="button"
        className="mt-2 text-sm text-slate-400 underline"
        onClick={() => {
          canvasRef.current?.getContext("2d")?.clearRect(0, 0, 700, 220);
          ink.current = false;
          onChange("");
        }}
      >
        {clearLabel}
      </button>
    </div>
  );
}
