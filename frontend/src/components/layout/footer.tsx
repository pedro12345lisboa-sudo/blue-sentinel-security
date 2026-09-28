import Link from 'next/link';
import { Github, Linkedin, Mail, ExternalLink, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

const footerLinks = {
  navegacao: [
    { name: 'Início', href: '/' },
    { name: 'Sobre', href: '/about' },
    { name: 'Projetos', href: '/projects' },
    { name: 'Artigos', href: '/writeups' },
    { name: 'Laboratório', href: '/lab' },
    { name: 'Status', href: '/status' },
  ],
  recursos: [
    { name: 'Segurança', href: '/security' },
    { name: 'Currículo', href: '/resume' },
    { name: 'Contato', href: '/contact' },
  ],
  social: [
    { name: 'GitHub', href: 'https://github.com', icon: Github, external: true },
    { name: 'LinkedIn', href: 'https://linkedin.com', icon: Linkedin, external: true },
    { name: 'Email', href: 'mailto:contact@blue-sentinel.local', icon: Mail, external: true },
  ],
};

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border/50 bg-background/50" role="contentinfo">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="xl:grid xl:grid-cols-3 xl:gap-8">
          <div className="space-y-8">
            <Link href="/" className="flex items-center gap-2" aria-label="Blue-Sentinel - Início">
              <Shield className="h-6 w-6 text-primary" aria-hidden="true" />
              <span className="text-xl font-mono font-bold text-foreground">blue-sentinel</span>
            </Link>
            <p className="text-base text-muted-foreground max-w-xs">
              Portfólio de Cybersecurity Blue Team. Detection engineering, threat hunting e automação de segurança defensiva.
            </p>
            <div className="flex items-center gap-6">
              {footerLinks.social.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  target={item.external ? '_blank' : undefined}
                  rel={item.external ? 'noopener noreferrer' : undefined}
                  className="text-muted-foreground hover:text-primary transition-colors"
                  aria-label={item.name}
                >
                  <item.icon className="h-5 w-5" aria-hidden="true" />
                  {item.external && <ExternalLink className="h-3.5 w-3.5 ml-1" aria-hidden="true" />}
                </a>
              ))}
            </div>
          </div>

          <nav className="grid grid-cols-2 gap-8 md:col-span-2 xl:col-span-1" aria-label="Navegação do rodapé">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4">Navegação</h3>
              <ul className="space-y-3" role="list">
                {footerLinks.navegacao.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4">Recursos</h3>
              <ul className="space-y-3" role="list">
                {footerLinks.recursos.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/50 pt-8 sm:flex-row">
          <p className="text-sm text-muted-foreground text-center sm:text-left">
            © {currentYear} Blue-Sentinel. Construído com Next.js, FastAPI e Docker.
          </p>
          <p className="text-sm text-muted-foreground text-center sm:text-right">
            Estritamente defensivo e educacional. Nenhum segredo real no código.
          </p>
        </div>
      </div>
    </footer>
  );
}