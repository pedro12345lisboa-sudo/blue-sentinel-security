'use client';

import { useEffect, useState } from 'react';
import { useReducedMotion, useInView } from '@/hooks';

interface UseCounterOptions {
  end: number;
  duration?: number;
  start?: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
}

export function useCounter({
  end,
  duration = 2000,
  start = 0,
  decimals = 0,
  suffix = '',
  prefix = '',
}: UseCounterOptions) {
  const [count, setCount] = useState(start);
  const [ref, isInView] = useInView<HTMLDivElement>({ triggerOnce: true, rootMargin: '0px 0px -50px 0px' });
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!isInView) return;
    if (reducedMotion) {
      setCount(end);
      return;
    }

    let startTime: number;
    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * easedProgress;
      setCount(Number(current.toFixed(decimals)));
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [isInView, end, duration, start, decimals, reducedMotion]);

  const formattedCount = `${prefix}${count.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;

  return { ref, count: formattedCount, isInView };
}