'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { NavigationMenu, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, navigationMenuItemStyle } from '@/components/ui/navigation-menu';

const navigation = [
  { name: 'Sobre', href: '/about' },
  { name: 'Projetos', href: '/projects' },
  { name: 'Artigos', href: '/writeups' },
  { name: 'Laboratório', href: '/lab' },
  { name: 'Status', href: '/status' },
  { name: 'Segurança', href: '/security' },
  { name: 'Currículo', href: '/resume' },
];

export function Header() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8" aria-label="Navegação principal">
        <Link href="/" className="flex items-center gap-2" aria-label="Blue-Sentinel - Início">
          <span className="text-xl font-mono font-bold text-primary">blue-sentinel</span>
          <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono bg-primary/10 text-primary rounded border border-primary/20">
            v0.1.0
          </span>
        </Link>

        <div className="hidden md:flex md:items-center md:gap-1">
          {navigation.map((item) => (
            <NavigationMenu key={item.href}>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuLink
                    asChild
                    active={pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))}
                  >
                    <Link
                      href={item.href}
                      className={cn(navigationMenuItemStyle(), 'px-3 py-2')}
                    >
                      {item.name}
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          ))}
        </div>

        <div className="hidden md:flex md:items-center md:gap-3">
          <Link href="/contact" className="btn-primary">
            <Mail className="h-4 w-4" aria-hidden="true" />
            Contato
          </Link>
        </div>

        <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
          <DialogTrigger asChild>
            <button
              className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg bg-background border border-border text-foreground hover:bg-accent"
              aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[400px]" id="mobile-menu">
            <div className="flex flex-col space-y-4">
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'px-4 py-3 text-lg font-medium rounded-lg transition-colors',
                    pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}
                  onClick={() => setMobileOpen(false)}
                >
                  {item.name}
                </Link>
              ))}
              <Separator className="my-2" />
              <Link href="/contact" className="btn-primary w-full justify-center" onClick={() => setMobileOpen(false)}>
                <Mail className="h-4 w-4" aria-hidden="true" />
                Contato
              </Link>
            </div>
          </DialogContent>
        </Dialog>
      </nav>
    </header>
  );
}

function Separator({ className }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('h-px bg-border', className)} role="separator" />;
}