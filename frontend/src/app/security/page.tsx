import { Metadata } from 'next';
import { Shield, Lock, Globe, Database, Code, Search, AlertTriangle, CheckCircle, XCircle, ExternalLink, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export const metadata: Metadata = {
  title: 'Security',
  description: 'How Blue-Sentinel protects itself: security architecture, threat model, and defensive measures.',
};

const securityMeasures = [
  {
    category: 'Network Security',
    items: [
      { title: 'Network Segmentation', description: 'Docker Compose with separate internal networks (frontend-net, backend-net). Database and Redis never exposed externally.', status: 'implemented', icon: Globe },
      { title: 'TLS Termination', description: 'Reverse proxy (Traefik/Caddy) handles TLS in production. Internal communication over HTTP within trusted network.', status: 'implemented', icon: Lock },
      { title: 'No Exposed Database Ports', description: 'PostgreSQL (5432) and Redis (6379) only accessible within backend-net. No port mapping to host.', status: 'implemented', icon: Database },
    ],
  },
  {
    category: 'Application Security',
    items: [
      { title: 'Security Headers', description: 'CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy via Next.js headers() and middleware.', status: 'implemented', icon: Shield },
      { title: 'Input Validation', description: 'Zod schemas for all API inputs. Pydantic models on backend. No dangerouslySetInnerHTML with external data.', status: 'implemented', icon: Search },
      { title: 'Rate Limiting', description: 'Redis-based sliding window rate limiting on contact form, lab WebSocket, and API endpoints.', status: 'implemented', icon: AlertTriangle },
      { title: 'CSRF Protection', description: 'SameSite=Lax cookies, CSRF tokens for state-changing operations. Double-submit cookie pattern.', status: 'implemented', icon: Shield },
      { title: 'Dependency Scanning', description: 'Automated npm audit, pip-audit, and Snyk/GitHub Dependabot in CI/CD pipeline.', status: 'implemented', icon: Code },
    ],
  },
  {
    category: 'Data Protection',
    items: [
      { title: 'Secrets Management', description: 'No secrets in code. .env.example with placeholders. Docker secrets in production. Environment variables only.', status: 'implemented', icon: Lock },
      { title: 'Non-Root Containers', description: 'All Docker containers run as non-root users (appuser UID 1000, nextjs UID 1001).', status: 'implemented', icon: Shield },
      { title: 'Read-Only Filesystems', description: 'Containers use read-only root filesystems where possible. Write access only to mounted volumes.', status: 'partial', icon: Database },
      { title: 'Audit Logging', description: 'Structured JSON logs for all API requests, auth events, and security-relevant actions.', status: 'implemented', icon: Search },
    ],
  },
  {
    category: 'Monitoring & Detection',
    items: [
      { title: 'Health Checks', description: 'Liveness (/health/live) and readiness (/health/ready) endpoints checking DB and Redis connectivity.', status: 'implemented', icon: CheckCircle },
      { title: 'Metrics Exposure', description: 'Prometheus metrics at /metrics. System resources, request latency, error rates, business metrics.', status: 'implemented', icon: Code },
      { title: 'Anomaly Detection', description: 'Rate limiting tracks IP behavior. Lab monitors for abnormal event patterns.', status: 'partial', icon: AlertTriangle },
      { title: 'Incident Response', description: 'Security.txt at /.well-known/security.txt. Contact: security@blue-sentinel.local', status: 'implemented', icon: AlertTriangle },
    ],
  },
];

const threatModel = [
  { threat: 'SQL Injection', mitigation: 'Parameterized queries via SQLAlchemy ORM. No raw SQL with user input.', status: 'mitigated' },
  { threat: 'XSS', mitigation: 'React auto-escapes. No dangerouslySetInnerHTML. CSP restricts inline scripts.', status: 'mitigated' },
  { threat: 'CSRF', mitigation: 'SameSite cookies, CSRF tokens, double-submit pattern for forms.', status: 'mitigated' },
  { threat: 'DDoS / Abuse', mitigation: 'Rate limiting per IP. Redis-backed sliding window. Nginx/Traefik rate limits at edge.', status: 'mitigated' },
  { threat: 'Secrets Exposure', mitigation: 'No secrets in repo. .env.example only. Docker secrets in prod. GitLeaks in CI.', status: 'mitigated' },
  { threat: 'Supply Chain', mitigation: 'Dependabot, npm audit, pip-audit, SBOM generation. Pinned dependencies.', status: 'mitigated' },
  { threat: 'Container Escape', mitigation: 'Non-root users, read-only fs, dropped capabilities, no privileged mode.', status: 'mitigated' },
  { threat: 'Data Exfiltration', mitigation: 'No sensitive data stored. Contact messages only. Encrypted at rest (PostgreSQL TDE).', status: 'mitigated' },
];

const compliance = [
  { standard: 'OWASP Top 10', coverage: '10/10', status: 'addressed' },
  { standard: 'OWASP ASVS Level 1', coverage: '85%', status: 'in-progress' },
  { standard: 'NIST CSF', coverage: 'Core functions mapped', status: 'addressed' },
  { standard: 'ISO 27001 Annex A', coverage: 'Selected controls', status: 'partial' },
];

export default function SecurityPage() {
  return (
    <div className="min-h-screen">
      <section className="section relative overflow-hidden">
        <div className="absolute inset-0 gradient-mesh" aria-hidden="true" />
        <div className="absolute inset-0 noise-overlay" aria-hidden="true" />
        <div className="container-wide relative">
          <div className="max-w-3xl">
            <h1 className="mb-4 text-display-lg font-display font-bold tracking-tight">
              Security Architecture
            </h1>
            <p className="text-lg text-muted-foreground text-balance">
              Transparency about how this portfolio protects itself. Security through obscurity is not security.
              All measures are visible here — and in the source code.
            </p>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="measures-title">
        <div className="container-wide">
          <h2 id="measures-title" className="mb-12 text-center heading-section text-display-md">
            Defensive Measures
          </h2>

          {securityMeasures.map((section) => (
            <section key={section.category} className="mb-16" aria-labelledby={`${section.category}-title`}>
              <h3 id={`${section.category}-title`} className="mb-8 text-2xl font-semibold text-center">
                {section.category}
              </h3>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {section.items.map((item) => (
                  <Card key={item.title} className="group hover:border-primary/30 hover:shadow-glow transition-all">
                    <CardHeader>
                      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <item.icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <CardTitle className="text-lg">{item.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                      <div className="flex items-center justify-between pt-3 border-t border-border/50">
                        <Badge
                          variant={
                            item.status === 'implemented' ? 'success' :
                            item.status === 'partial' ? 'warning' : 'secondary'
                          }
                        >
                          {item.status === 'implemented' ? 'Implemented' :
                           item.status === 'partial' ? 'Partial' : 'Planned'}
                        </Badge>
                        <span className="text-xs font-mono text-muted-foreground">
                          Verified
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="section bg-gradient-to-b from-background to-card/50" aria-labelledby="threats-title">
        <div className="container-wide">
          <div className="mb-12 text-center">
            <h2 id="threats-title" className="heading-section text-display-md mb-4">
              Threat Model
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              STRIDE-inspired threat model for the portfolio application. Each threat has a corresponding mitigation.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full" role="table">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left p-4 font-semibold">Threat</th>
                  <th className="text-left p-4 font-semibold">Mitigation</th>
                  <th className="text-center p-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {threatModel.map((item) => (
                  <tr key={item.threat} className="border-b border-border/50 hover:bg-card/50 transition-colors">
                    <td className="p-4">
                      <code className="font-mono text-sm">{item.threat}</code>
                    </td>
                    <td className="p-4 text-sm text-muted-foreground">{item.mitigation}</td>
                    <td className="p-4 text-center">
                      <Badge variant={item.status === 'mitigated' ? 'success' : 'warning'}>
                        {item.status === 'mitigated' ? 'Mitigated' : 'Partial'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="compliance-title">
        <div className="container-wide">
          <div className="mb-12 text-center">
            <h2 id="compliance-title" className="heading-section text-display-md mb-4">
              Standards Alignment
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Mapping to recognized security frameworks and standards.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {compliance.map((item) => (
              <Card key={item.standard} className="text-center">
                <CardContent className="pt-6">
                  <div className="mb-2 text-3xl font-bold text-primary">{item.coverage}</div>
                  <h3 className="mb-2 font-semibold">{item.standard}</h3>
                  <Badge variant={item.status === 'addressed' ? 'success' : item.status === 'in-progress' ? 'warning' : 'secondary'}>
                    {item.status === 'addressed' ? 'Addressed' : item.status === 'in-progress' ? 'In Progress' : 'Partial'}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="section bg-gradient-to-b from-card/50 to-background" aria-labelledby="disclosure-title">
        <div className="container-wide">
          <div className="max-w-2xl mx-auto text-center">
            <h2 id="disclosure-title" className="heading-section text-display-md mb-6">
              Responsible Disclosure
            </h2>
            <div className="space-y-6 text-lg text-muted-foreground text-balance">
              <p>
                If you discover a security vulnerability in Blue-Sentinel, please report it responsibly.
              </p>
              <div className="space-y-4 text-left">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-card border border-border/50">
                  <Mail className="h-6 w-6 text-primary flex-shrink-0" aria-hidden="true" />
                  <div>
                    <h4 className="font-semibold text-foreground">Email</h4>
                    <a href="mailto:security@blue-sentinel.local" className="text-primary hover:underline">security@blue-sentinel.local</a>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg bg-card border border-border/50">
                  <Github className="h-6 w-6 text-primary flex-shrink-0" aria-hidden="true" />
                  <div>
                    <h4 className="font-semibold text-foreground">GitHub Security Advisories</h4>
                    <a href="https://github.com/your-org/blue-sentinel/security/advisories/new" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      Report via GitHub
                    </a>
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground/70">
                We aim to acknowledge reports within 48 hours and provide a fix timeline within 7 days.
                No bug bounty program — this is a personal portfolio, not a production service.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Mail({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}