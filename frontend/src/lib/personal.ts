/**
 * Dados pessoais do dono do portfólio, configurados por variáveis de ambiente
 * (`NEXT_PUBLIC_*`). O repositório nunca contém dados reais: os fallbacks são
 * placeholders e o `.env` (não versionado) é quem traz os valores verdadeiros.
 *
 * Variáveis suportadas (todas opcionais):
 *
 * | Variável                      | Sobrescreve                          |
 * |-------------------------------|--------------------------------------|
 * | `NEXT_PUBLIC_OWNER_NAME`      | `profile.name`                       |
 * | `NEXT_PUBLIC_CONTACT_EMAIL`   | `contacts.general`                   |
 * | `NEXT_PUBLIC_SECURITY_EMAIL`  | `contacts.security`                  |
 * | `NEXT_PUBLIC_LINKEDIN_URL`    | `contacts.linkedin`                  |
 * | `NEXT_PUBLIC_GITHUB_URL`      | `contacts.github`                    |
 * | `NEXT_PUBLIC_REPOSITORY_URL`  | `contacts.repository` (+ `/issues`)  |
 * | `NEXT_PUBLIC_PHONE`           | `contacts.phone`                     |
 * | `NEXT_PUBLIC_SITE_URL`        | base canônica (já usada por `siteUrl`) |
 */
export interface PersonalOverrides {
  name?: string;
  generalEmail?: string;
  securityEmail?: string;
  linkedin?: string;
  github?: string;
  repository?: string;
  phone?: string;
}

function env(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

export function personalOverrides(): PersonalOverrides {
  return {
    name: env('NEXT_PUBLIC_OWNER_NAME'),
    generalEmail: env('NEXT_PUBLIC_CONTACT_EMAIL'),
    securityEmail: env('NEXT_PUBLIC_SECURITY_EMAIL'),
    linkedin: env('NEXT_PUBLIC_LINKEDIN_URL'),
    github: env('NEXT_PUBLIC_GITHUB_URL'),
    repository: env('NEXT_PUBLIC_REPOSITORY_URL'),
    phone: env('NEXT_PUBLIC_PHONE'),
  };
}

interface SiteLike {
  contacts: Record<string, string>;
  profile: Record<string, unknown>;
}

/**
 * Aplica os overrides de ambiente sobre o dicionário de mensagens. Só campos
 * presentes no ambiente são tocados; sem `.env`, o conteúdo fica 100% com os
 * placeholders do JSON.
 */
export function applyPersonalOverrides<T extends SiteLike>(site: T): T {
  const overrides = personalOverrides();
  const contacts = { ...site.contacts };
  const profile = overrides.name ? { ...site.profile, name: overrides.name } : site.profile;

  if (overrides.generalEmail) contacts.general = overrides.generalEmail;
  if (overrides.securityEmail) contacts.security = overrides.securityEmail;
  if (overrides.linkedin) contacts.linkedin = overrides.linkedin;
  if (overrides.github) contacts.github = overrides.github;
  if (overrides.phone) contacts.phone = overrides.phone;
  if (overrides.repository) {
    contacts.repository = overrides.repository;
    contacts.issues = `${overrides.repository.replace(/\/$/, '')}/issues`;
  }

  return { ...site, contacts, profile };
}
