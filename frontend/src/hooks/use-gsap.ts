'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from './use-reduced-motion';

export function useGSAP() {
  const reducedMotion = useReducedMotion();
  const gsapRef = useRef<(typeof import('gsap'))['default'] | null>(null);
  const scrollTriggerRef = useRef<(typeof import('gsap/ScrollTrigger'))['default'] | null>(null);

  useEffect(() => {
    if (reducedMotion) return;

    const loadGSAP = async () => {
      const [gsapModule, scrollTriggerModule] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      gsapRef.current = gsapModule.default;
      scrollTriggerRef.current = scrollTriggerModule.default;
      gsapModule.default.registerPlugin(scrollTriggerModule.default);
    };

    loadGSAP();

    return () => {
      gsapRef.current = null;
      scrollTriggerRef.current = null;
    };
  }, [reducedMotion]);

  return { gsap: gsapRef.current, ScrollTrigger: scrollTriggerRef.current };
}