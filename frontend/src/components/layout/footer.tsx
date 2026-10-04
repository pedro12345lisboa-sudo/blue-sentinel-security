import { Github, Linkedin, Mail, ExternalLink, Shield } from 'lucide-react';
import { LocalizedLink, type Messages } from '@/i18n';

const socialIcons: Record<string, typeof Github> = {
  repository: Github,
  linkedin: Linkedin,
  general: Mail,
};

interface FooterProps {
  site: Messages;
}

export function Footer({ site }: FooterProps) {
  const currentYear = new Date().getFullYear();
  const { nav, footer } = site;

  const socialHref: Record<string, string> = {
    repository: site.contacts.repository,
    linkedin: site.contacts.linkedin,
    general: `mailto:${site.contacts.general}`,
  };

  return (
    <footer className="no-print border-t border-border/50 bg-background/50" role="contentinfo">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="xl:grid xl:grid-cols-3 xl:gap-8">
          <div className="space-y-8">
            <LocalizedLink href="/" className="flex items-center gap-2" aria-label={nav.ariaHome}>
              <Shield className="h-6 w-6 text-primary" aria-hidden="true" />
              <span className="text-xl font-mono font-bold text-foreground">{site.brand.name}</span>
            </LocalizedLink>
            <p className="text-base text-muted-foreground max-w-xs">
              {footer.description}
            </p>
            <div className="flex items-center gap-6">
              {nav.social.map((item) => {
                const Icon = socialIcons[item.hrefKey] ?? ExternalLink;
                const href = socialHref[item.hrefKey] ?? '#';
                const isExternal = !href.startsWith('mailto:');
                return (
                  <a
                    key={item.hrefKey}
                    href={href}
                    target={isExternal ? '_blank' : undefined}
                    rel={isExternal ? 'noopener noreferrer' : undefined}
                    className="text-muted-foreground hover:text-primary transition-colors"
                    aria-label={item.name}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {isExternal && <ExternalLink className="h-3.5 w-3.5 ml-1" aria-hidden="true" />}
                  </a>
                );
              })}
            </div>
          </div>

          <nav className="grid grid-cols-2 gap-8 md:col-span-2 xl:col-span-1" aria-label={nav.footerLabel}>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4">{nav.columns.navigation}</h3>
              <ul className="space-y-3">
                {nav.items.map((item) => (
                  <li key={item.href}>
                    <LocalizedLink
                      href={item.href}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      {item.name}
                    </LocalizedLink>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4">{nav.columns.resources}</h3>
              <ul className="space-y-3">
                {nav.resources.map((item) => (
                  <li key={item.href}>
                    <LocalizedLink
                      href={item.href}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      {item.name}
                    </LocalizedLink>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/50 pt-8 sm:flex-row">
          <p className="text-sm text-muted-foreground text-center sm:text-left">
            © {currentYear} {site.brand.fullName}. {footer.builtWith}
          </p>
          <p className="text-sm text-muted-foreground text-center sm:text-right">
            {footer.ethical}
          </p>
        </div>
      </div>
    </footer>
  );
}
