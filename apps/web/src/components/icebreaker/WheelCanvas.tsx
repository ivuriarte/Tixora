'use client';

import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';

/** Multicolor palette — vibrant, high-contrast, accessible on white text */
const SLICE_COLORS = [
  '#E24B4A', // red
  '#378ADD', // blue
  '#639922', // green
  '#EF9F27', // amber
  '#7C3AED', // brand purple
  '#D85A30', // coral
  '#1D9E75', // teal
  '#D4537E', // pink
  '#5B21B6', // deep purple
  '#185FA5', // navy
  '#3B6D11', // forest
  '#BA7517', // brown-gold
];

export interface WheelCanvasHandle {
  spin: () => void;
}

interface WheelCanvasProps {
  names: string[];
  onWinner: (name: string, index: number) => void;
  disabled?: boolean;
}

const WheelCanvas = forwardRef<WheelCanvasHandle, WheelCanvasProps>(
  function WheelCanvas({ names, onWinner, disabled }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const angleRef = useRef(0);
    const spinningRef = useRef(false);
    const rafRef = useRef<number>(0);

    const draw = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const displaySize = 340;
      canvas.width = displaySize * dpr;
      canvas.height = displaySize * dpr;
      canvas.style.width = `${displaySize}px`;
      canvas.style.height = `${displaySize}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cx = displaySize / 2;
      const cy = displaySize / 2;
      const radius = 150;

      ctx.clearRect(0, 0, displaySize, displaySize);

      const n = names.length;
      if (n === 0) {
        ctx.fillStyle = '#E4DCF4';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#756a92';
        ctx.font = '500 14px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No participants yet', cx, cy - 8);
        ctx.font = '400 12px Inter, system-ui, sans-serif';
        ctx.fillText('Waiting for check-ins', cx, cy + 10);
        return;
      }

      const sliceAngle = (Math.PI * 2) / n;

      for (let i = 0; i < n; i++) {
        const start = angleRef.current + i * sliceAngle;
        const end = start + sliceAngle;

        // Slice
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, start, end);
        ctx.closePath();
        ctx.fillStyle = SLICE_COLORS[i % SLICE_COLORS.length];
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Label
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(start + sliceAngle / 2);
        ctx.fillStyle = 'white';
        const fontSize = n > 16 ? 9 : n > 12 ? 10 : n > 8 ? 11 : 13;
        ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        let display = names[i];
        const maxWidth = radius - 34;
        if (ctx.measureText(display).width > maxWidth) {
          const parts = names[i].split(' ');
          display = parts[0] + (parts[1] ? ' ' + parts[1][0] + '.' : '');
          if (ctx.measureText(display).width > maxWidth) {
            display = parts[0];
          }
        }
        ctx.fillText(display, radius - 18, 0);
        ctx.restore();
      }

      // Center hub
      ctx.beginPath();
      ctx.arc(cx, cy, 26, 0, Math.PI * 2);
      ctx.fillStyle = 'white';
      ctx.fill();
      ctx.strokeStyle = '#E4DCF4';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Brand mark in center
      ctx.fillStyle = '#7C3AED';
      ctx.font = '600 9px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('AXON', cx, cy);

      // Pointer triangle (right side)
      ctx.beginPath();
      ctx.moveTo(cx + radius + 14, cy);
      ctx.lineTo(cx + radius - 6, cy - 11);
      ctx.lineTo(cx + radius - 6, cy + 11);
      ctx.closePath();
      ctx.fillStyle = '#4C1D95';
      ctx.fill();
    }, [names]);

    useEffect(() => {
      draw();
    }, [draw]);

    const spin = useCallback(() => {
      if (spinningRef.current || names.length === 0 || disabled) return;
      spinningRef.current = true;

      const totalRotation = Math.PI * 2 * (5 + Math.random() * 5);
      const duration = 4000 + Math.random() * 1000;
      const startAngle = angleRef.current;
      const startTime = performance.now();

      function easeOut(t: number): number {
        return 1 - Math.pow(1 - t, 4);
      }

      function animate(now: number) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        angleRef.current = startAngle - totalRotation * easeOut(progress);
        draw();

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate);
        } else {
          spinningRef.current = false;
          // Calculate winner: the slice at the pointer (0 radians = right side)
          const n = names.length;
          const sliceAngle = (Math.PI * 2) / n;
          const normalized =
            (((-angleRef.current % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
          const winnerIndex = Math.floor(normalized / sliceAngle) % n;
          onWinner(names[winnerIndex], winnerIndex);
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    }, [names, onWinner, disabled, draw]);

    useImperativeHandle(ref, () => ({ spin }), [spin]);

    useEffect(() => {
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }, []);

    return (
      <canvas
        ref={canvasRef}
        style={{ width: 340, height: 340, cursor: disabled ? 'default' : 'pointer' }}
        onClick={spin}
        role="img"
        aria-label={
          names.length > 0
            ? `Wheel with ${names.length} participants. Click or press spacebar to spin.`
            : 'Empty wheel. Waiting for attendees to check in.'
        }
      />
    );
  },
);

export default WheelCanvas;
