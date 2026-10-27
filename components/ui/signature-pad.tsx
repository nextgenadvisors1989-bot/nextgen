'use client';

import { useEffect, useRef, useState } from 'react';

/** Canvas signature capture; emits a PNG data URL on change. */
export function SignaturePad({ value, onChange, label = 'Signature', width = 500, height = 160, disabled, error, helper }: {
  value?: string;
  onChange?: (dataUrl: string) => void;
  label?: string;
  width?: number;
  height?: number;
  disabled?: boolean;
  error?: string;
  helper?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasInk, setHasInk] = useState(Boolean(value));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#1e293b';
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    if (value) {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
      image.src = value;
    }
  }, [value]);

  const position = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    const { x, y } = position(event);
    context.beginPath();
    context.moveTo(x, y);
    setDrawing(true);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || disabled) return;
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    const { x, y } = position(event);
    context.lineTo(x, y);
    context.stroke();
  };

  const end = () => {
    if (!drawing) return;
    setDrawing(false);
    setHasInk(true);
    onChange?.(canvasRef.current?.toDataURL('image/png') ?? '');
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange?.('');
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="label mb-0">{label}</span>
        <button type="button" onClick={clear} disabled={disabled} className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50">
          Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full cursor-crosshair rounded-lg border border-dashed border-line bg-white touch-none"
        style={{ maxWidth: width }}
      />
      {!hasInk && !disabled && <p className="helper">Sign above using your mouse, stylus or finger.</p>}
      {error ? <p className="error-text">{error}</p> : helper && hasInk ? <p className="helper">{helper}</p> : null}
    </div>
  );
}
