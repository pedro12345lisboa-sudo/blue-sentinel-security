import { NextResponse, type NextRequest } from 'next/server';
import {
  defaultLocale,
  isLocale,
  localeCookie,
  negotiateLocale,
} from '@/i18n/config';

/**
 * Negociação de idioma sem redirecionamento agressivo:
 *
 * 1. Caminhos já prefixados (`/pt-BR/...`, `/en/...`) passam direto — a
 *    escolha do usuário é sempre respeitada, nunca "corrigida".
 * 2. Caminhos sem prefixo ganham o idioma preferido: cookie explícito →
 *    `Accept-Language` → idioma padrão (pt-BR). É um redirect único e
 *    determinístico (307) para a URL canônica com hreflang.
 * 3. O cookie só é escrito pelo seletor de idioma (escolha humana), não pela
 *    detecção automática — um visitante pode sempre voltar a escolher.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isLocale(firstSegment(pathname))) {
    return NextResponse.next();
  }

  const cookieLocale = request.cookies.get(localeCookie)?.value;
  const preferred =
    (cookieLocale && isLocale(cookieLocale) && cookieLocale) ||
    negotiateLocale(request.headers.get('accept-language')) ||
    defaultLocale;

  const url = request.nextUrl.clone();
  url.pathname = pathname === '/' ? `/${preferred}` : `/${preferred}${pathname}`;
  return NextResponse.redirect(url, 307);
}

function firstSegment(pathname: string): string | undefined {
  return pathname.split('/')[1] || undefined;
}

export const config = {
  // Rotas de asset/API ficam fora; o resto passa pela negociação de idioma.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.json|.*\\..*).*)'],
};
