import { Metadata } from 'next';
import {
  Award,
  Calendar,
  Code,
  ExternalLink,
  GraduationCap,
  Mail,
  MapPin,
  Phone,
  Shield,
} from 'lucide-react';
import { readMdx } from '@/lib/content';
import { getSite, pageMetadata, formatDate, type Locale } from '@/i18n';
import { getAllProjects } from '@/lib/projects';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PrintButton } from './print-button';

interface ResumeProps {
  params: { locale: Locale };
}

export function generateMetadata({ params }: ResumeProps): Metadata {
  const site = getSite(params.locale);
  return pageMetadata(params.locale, {
    title: site.seo.resume.title,
    description: site.seo.resume.description,
    path: '/resume',
  });
}

interface ResumeCertifications {
  certifications?: {
    name: string;
    issuer: string;
    year: string;
    status?: string;
  }[];
}

function getStatusLabel(status?: string, labels?: { active: string; planned: string }): string | undefined {
  if (status === 'active') return labels?.active;
  if (status === 'planned') return labels?.planned;
  return status;
}

export default function ResumePage({ params }: ResumeProps) {
  const site = getSite(params.locale);
  const aboutDoc = readMdx<ResumeCertifications>(params.locale, 'about.mdx');
  const certifications = aboutDoc?.frontmatter.certifications ?? [];
  const projects = getAllProjects(params.locale);

  const profile = site.profile;
  const contacts = site.contacts;
  const resume = site.pages.resume;
  const labels = resume.labels;

  return (
    <div className="min-h-screen">
      <header className="section-sm relative overflow-hidden border-b border-border/50">
        <div className="absolute inset-0 gradient-mesh opacity-50" aria-hidden="true" />
        <div className="container-wide relative">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div>
              <h1 className="text-display-md font-display font-bold tracking-tight">
                {resume.title}
              </h1>
              <p className="mt-1 text-muted-foreground">
                {profile.title} — {profile.location}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <PrintButton label={resume.actions.pdf} />
              <Button variant="ghost" asChild>
                <a href={contacts.github} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" />
                  {resume.actions.github}
                </a>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container-wide py-8 px-6">
        <div className="grid lg:grid-cols-4 gap-8">
          <aside className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <div className="text-center">
                  <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 text-primary mx-auto">
                    <Shield className="h-12 w-12" aria-hidden="true" />
                  </div>
                  <h2 className="text-2xl font-bold">{profile.name}</h2>
                  <p className="text-primary font-medium">{profile.title}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{profile.location}</p>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <div
                  className="pt-4 border-t border-border/50 space-y-3"
                  aria-label={resume.sections.contact}
                >
                  <a href={`mailto:${contacts.general}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
                    <Mail className="h-4 w-4" aria-hidden="true" />
                    {contacts.general}
                  </a>
                  <a href={`tel:${contacts.phone}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
                    <Phone className="h-4 w-4" aria-hidden="true" />
                    {contacts.phone}
                  </a>
                  <a href={contacts.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    LinkedIn
                  </a>
                  <a href={contacts.github} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    GitHub
                  </a>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5" aria-hidden="true" />
                  {resume.sections.certifications}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {certifications.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{labels.noCertifications}</p>
                ) : (
                  certifications.map((cert, index) => (
                    <div key={`${cert.name}-${index}`} className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50">
                      <div>
                        <p className="font-semibold text-foreground">{cert.name}</p>
                        <p className="text-xs text-muted-foreground">{cert.issuer} · {cert.year}</p>
                      </div>
                      {cert.status && (
                        <Badge variant={cert.status === 'active' ? 'success' : 'secondary'} className="text-xs">
                          {getStatusLabel(cert.status, labels)}
                        </Badge>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="h-5 w-5" aria-hidden="true" />
                  {resume.sections.skills}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                {site.sections.skills.groups.map((group) => (
                  <div key={group.title}>
                    <h4 className="mb-2 text-sm font-medium text-muted-foreground">{group.title}</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {group.items.map((skill) => (
                        <Badge key={skill} variant="outline" className="text-xs">{skill}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </aside>

          <div className="lg:col-span-3 space-y-8">
            <section aria-labelledby="summary-title">
              <h2 id="summary-title" className="mb-4 text-xl font-semibold">{resume.sections.summary}</h2>
              <p className="text-muted-foreground leading-relaxed">{profile.summary}</p>
            </section>

            <section aria-labelledby="experience-title">
              <h2 id="experience-title" className="mb-6 text-xl font-semibold">{resume.sections.experience}</h2>
              {profile.experience.length === 0 ? (
                <p className="text-muted-foreground">{labels.noExperience}</p>
              ) : (
                profile.experience.map((job) => (
                  <Card key={job.role} className="overflow-hidden">
                    <CardHeader>
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold">{job.role}</h3>
                          <p className="text-primary font-medium">{job.company}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                              {job.period}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                              {job.location}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-0">
                      <p className="text-muted-foreground">{job.description}</p>
                      <div>
                        <h4 className="mb-2 text-sm font-medium">{resume.sections.achievements}</h4>
                        <ul className="space-y-1 pl-4">
                          {job.achievements.map((achievement, index) => (
                            <li key={`${achievement}-${index}`} className="text-sm text-muted-foreground list-disc">
                              {achievement}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {job.technologies.map((tech, index) => (
                          <Badge key={`${tech}-${index}`} variant="outline" className="text-xs">{tech}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </section>

            <section aria-labelledby="education-title">
              <h2 id="education-title" className="mb-6 text-xl font-semibold">{resume.sections.education}</h2>
              {profile.education.length === 0 ? (
                <p className="text-muted-foreground">{labels.noEducation}</p>
              ) : (
                profile.education.map((edu) => (
                  <Card key={edu.degree}>
                    <CardContent className="pt-6">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold">{edu.degree}</h3>
                          <p className="text-primary font-medium">{edu.school}</p>
                          <p className="text-sm text-muted-foreground">{edu.period}</p>
                          <p className="mt-2 text-sm text-muted-foreground">{edu.details}</p>
                        </div>
                        <Badge variant="secondary"><GraduationCap className="h-3 w-3 mr-1.5" aria-hidden="true" />{labels.degree}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </section>

            <section aria-labelledby="projects-title">
              <h2 id="projects-title" className="mb-6 text-xl font-semibold">{resume.sections.projects}</h2>
              {projects.length === 0 ? (
                <p className="text-muted-foreground">{site.microcopy.empty.projects}</p>
              ) : (
                projects.map((project) => (
                  <Card key={project.slug}>
                    <CardContent className="pt-6">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold">{project.title}</h3>
                          <p className="mt-1 text-muted-foreground">{project.description}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {project.tags.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </section>
          </div>
        </div>
      </div>

      <footer className="border-t border-border/50 bg-background/50 py-8">
        <div className="container-wide text-center text-sm text-muted-foreground">
          <p>
            {resume.updatedAt}{' '}
            {formatDate(new Date(), params.locale, { year: 'numeric', month: 'long' })}
          </p>
          <p className="mt-1">{labels.footerStack}</p>
        </div>
      </footer>
    </div>
  );
}
