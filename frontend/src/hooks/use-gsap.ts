'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from './use-reduced-motion';

export function useGSAP() {
  const reducedMotion = useReducedMotion();
  const gsapRef = useRef<typeof import('gsap') | null>(null);
  const scrollTriggerRef = useRef<typeof import('gsap/ScrollTrigger') | null>(null);

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
      if (gsapRef.current) {
        gsapRef.current.killAll();
      }
    };
  }, [reducedMotion]);

  return { gsap: gsapRef.current, ScrollTrigger: scrollTriggerRef.current };
}