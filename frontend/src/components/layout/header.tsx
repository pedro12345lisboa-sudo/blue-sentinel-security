'use client';

import * as React from 'react';
import { Menu, X, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { NavigationMenu, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, navigationMenuItemStyle } from '@/components/ui/navigation-menu';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { useSite, useLocalizedPathname, LocalizedLink } from '@/i18n';

export function Header() {
  const site = useSite();
  const { path: pathname } = useLocalizedPathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const { nav } = site;
  const isActive = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8" aria-label={nav.mainLabel}>
        <LocalizedLink href="/" className="flex items-center gap-2" aria-label={nav.ariaHome}>
          <span className="text-xl font-mono font-bold text-primary">{site.brand.name}</span>
          <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono bg-primary/10 text-primary rounded border border-primary/20">
            {site.brand.version}
          </span>
        </LocalizedLink>

        <div className="hidden md:flex md:items-center md:gap-1">
          {nav.items.map((item) => (
            <NavigationMenu key={item.href}>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuLink
                    asChild
                    active={isActive(item.href)}
                  >
                    <LocalizedNavLink href={item.href} active={isActive(item.href)}>
                      {item.name}
                    </LocalizedNavLink>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          ))}
        </div>

        <div className="hidden md:flex md:items-center md:gap-3">
          <LocaleSwitcher className="mr-1" />
          <LocalizedLink href={nav.contact.href} className="btn-primary">
            <Mail className="h-4 w-4" aria-hidden="true" />
            {nav.contact.name}
          </LocalizedLink>
        </div>

        <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
          <DialogTrigger asChild>
            <button
              className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg bg-background border border-border text-foreground hover:bg-accent"
              aria-label={mobileOpen ? nav.closeMenu : nav.openMenu}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[400px]" id="mobile-menu">
            <div className="flex flex-col space-y-4">
              {nav.items.map((item) => (
                <LocalizedNavLink
                  key={item.href}
                  href={item.href}
                  active={isActive(item.href)}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'px-4 py-3 text-lg font-medium rounded-lg transition-colors',
                    isActive(item.href)
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}
                >
                  {item.name}
                </LocalizedNavLink>
              ))}
              <Separator className="my-2" />
              <LocalizedLink href={nav.contact.href} className="btn-primary w-full justify-center" onClick={() => setMobileOpen(false)}>
                <Mail className="h-4 w-4" aria-hidden="true" />
                {nav.contact.name}
              </LocalizedLink>
              <LocaleSwitcher className="justify-center" />
            </div>
          </DialogContent>
        </Dialog>
      </nav>
    </header>
  );
}

/**
 * Link interno apontando para a rota no idioma ativo, com estado ativo.
 * Vive aqui (client) para reaproveitar a classe de ativo em desktop/mobile.
 */
function LocalizedNavLink({
  href,
  active,
  className,
  children,
  onClick,
}: {
  href: string;
  active: boolean;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <LocalizedLink
      href={href}
      className={className ?? cn(navigationMenuItemStyle(), 'px-3 py-2')}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      {children}
    </LocalizedLink>
  );
}

function Separator({ className }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('h-px bg-border', className)} role="separator" />;
}
