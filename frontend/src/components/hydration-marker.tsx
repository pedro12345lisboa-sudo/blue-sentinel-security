'use client';

import { useEffect } from 'react';

/**
 * Marcador de hidratação: define `html[data-hydrated]` assim que o React monta.
 *
 * Os testes E2E precisam saber quando pode-se interagir com a página — clicar
 * num `next/link` antes disso aborta a navegação em dev (compilação sob
 * demanda) e o teste fica preso esperando a URL mudar.
 */
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true';
  }, []);

  return null;
}
