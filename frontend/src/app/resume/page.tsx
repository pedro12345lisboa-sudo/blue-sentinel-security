import { Metadata } from 'next';
import { Download, ExternalLink, Mail, MapPin, Phone, Calendar, Award, Briefcase, GraduationCap, Code, Shield, Terminal, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export const metadata: Metadata = {
  title: 'Resume',
  description: 'Professional resume: Blue Team engineer with detection engineering, threat hunting, and security automation expertise.',
};

const resumeData = {
  name: 'Blue-Sentinel',
  title: 'Senior Detection Engineer / Blue Team Lead',
  location: 'Remote / Global',
  email: 'contact@blue-sentinel.local',
  phone: '+55 11 99999-9999',
  linkedin: 'https://linkedin.com/in/blue-sentinel',
  github: 'https://github.com/blue-sentinel',
  summary: 'Blue Team engineer with 6+ years of experience in SOC operations, detection engineering, threat hunting, and security automation. Proven track record of building high-fidelity detection logic, reducing false positives by 70%+, and developing security tooling in C++, Python, and Go. Passionate about open-source security and community knowledge sharing.',
  experience: [
    {
      role: 'Senior Detection Engineer',
      company: 'Enterprise SOC',
      period: '2024 — Present',
      location: 'Remote',
      description: 'Leading detection engineering for 5000+ endpoint environment. Designed and deployed 200+ Sigma rules covering 85% of MITRE ATT&CK techniques. Built automated threat hunting framework reducing investigation time by 60%.',
      achievements: [
        'Reduced false positive rate by 73% through rule tuning and enrichment',
        'Developed C++ eBPF agent for kernel-level telemetry collection',
        'Implemented SOAR playbooks for automated incident response',
        'Mentored 5 junior engineers on detection engineering practices',
      ],
      technologies: ['Sigma', 'YARA', 'Splunk', 'Elastic', 'Python', 'C++', 'eBPF', 'MITRE ATT&CK', 'SOAR'],
    },
    {
      role: 'Security Engineer',
      company: 'FinTech Startup',
      period: '2022 — 2024',
      location: 'São Paulo, BR',
      description: 'Built security automation pipelines and endpoint monitoring. Developed custom C++20 agent with eBPF (Linux) and ETW (Windows) for process, network, and file system telemetry. Integrated with SIEM via Kafka.',
      achievements: [
        'Built cross-platform C++ agent (Linux/Windows/macOS)',
        'Implemented HMAC-SHA256 authentication for agent-to-server',
        'Created detection pipeline: Sigma → rule validation → SIEM deployment',
        'Achieved 99.9% agent uptime across 2000+ endpoints',
      ],
      technologies: ['C++20', 'CMake', 'eBPF', 'ETW', 'Go', 'Kubernetes', 'Kafka', 'Prometheus', 'Grafana'],
    },
    {
      role: 'SOC Analyst L2/L3',
      company: 'MSSP',
      period: '2020 — 2022',
      location: 'São Paulo, BR',
      description: 'Incident response, threat hunting, and malware analysis for 50+ clients. Created detection rules for APT campaigns (APT28, APT29, Lazarus). Performed memory forensics with Volatility.',
      achievements: [
        'Analyzed 500+ security incidents per quarter',
        'Developed 50+ custom YARA rules for malware families',
        'Conducted purple team exercises with red team',
        'Built threat intelligence feeds integration',
      ],
      technologies: ['Splunk', 'CrowdStrike', 'Volatility', 'YARA', 'MITRE ATT&CK', 'MISP', 'OpenCTI'],
    },
  ],
  education: [
    {
      degree: 'B.Sc. Computer Science',
      school: 'University of São Paulo',
      period: '2014 — 2018',
      details: 'Focus: Systems Programming, Network Security, Cryptography. Thesis: "Behavioral Analysis of Fileless Malware using eBPF".',
    },
  ],
  certifications: [
    { name: 'GCIA', issuer: 'GIAC', year: 2023, status: 'active' },
    { name: 'GCFA', issuer: 'GIAC', year: 2022, status: 'active' },
    { name: 'GCIH', issuer: 'GIAC', year: 2021, status: 'active' },
    { name: 'Security+', issuer: 'CompTIA', year: 2019, status: 'active' },
    { name: 'CySA+', issuer: 'CompTIA', year: 2020, status: 'active' },
    { name: 'eJPT', issuer: 'INE', year: 2019, status: 'active' },
  ],
  skills: {
    'Detection Engineering': ['Sigma Rules', 'YARA', 'MITRE ATT&CK Mapping', 'Alert Tuning', 'False Positive Reduction', 'Log Analysis'],
    'Threat Hunting': ['Hypothesis-Driven Hunts', 'Behavioral Analytics', 'ATT&CK Coverage Assessment', 'Purple Teaming', 'Timeline Analysis'],
    'Security Automation': ['SOAR Playbooks', 'Python/Go Tooling', 'CI/CD Security Gates', 'API Integration', 'Workflow Orchestration'],
    'Systems Programming': ['C++20', 'eBPF', 'Kernel Modules', 'Memory Forensics', 'Network Programming', 'Performance Optimization'],
    'Platforms & Tools': ['Splunk', 'Elastic', 'Kubernetes', 'Docker', 'Linux', 'Windows Internals', 'GitHub Actions', 'Prometheus', 'Grafana'],
  },
  projects: [
    { name: 'Blue-Sentinel Portfolio', description: 'Full-stack portfolio with interactive detection lab, real-time metrics, and synthetic event generation.', tech: ['Next.js', 'FastAPI', 'PostgreSQL', 'Redis', 'WebSocket', 'Sigma', 'Docker'] },
    { name: 'Sentinel Agent (C++)', description: 'High-performance C++20 security agent for endpoint telemetry with HMAC auth and Sigma rule evaluation.', tech: ['C++20', 'CMake', 'eBPF', 'ETW', 'HMAC', 'Sigma', 'ZeroMQ'] },
    { name: 'Detection Pipeline', description: 'Automated Sigma rule validation, testing, and deployment pipeline with GitHub Actions.', tech: ['Python', 'GitHub Actions', 'Sigma', 'MITRE ATT&CK', 'Docker', 'pytest'] },
  ],
};

export default function ResumePage() {
  const downloadPDF = () => {
    window.print();
  };

  return (
    <div className="min-h-screen">
      <header className="section-sm relative overflow-hidden border-b border-border/50">
        <div className="absolute inset-0 gradient-mesh opacity-50" aria-hidden="true" />
        <div className="container-wide relative">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div>
              <h1 className="text-display-md font-display font-bold tracking-tight">
                Resume / CV
              </h1>
              <p className="mt-1 text-muted-foreground">
                {resumeData.title} — {resumeData.location}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={downloadPDF}>
                <Download className="h-4 w-4 mr-2" aria-hidden="true" />
                Save as PDF
              </Button>
              <Button variant="ghost" asChild>
                <a href="https://github.com/blue-sentinel" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" />
                  GitHub
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
                  <h2 className="text-2xl font-bold">{resumeData.name}</h2>
                  <p className="text-primary font-medium">{resumeData.title}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{resumeData.location}</p>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <div className="pt-4 border-t border-border/50 space-y-3">
                  <a href={`mailto:${resumeData.email}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
                    <Mail className="h-4 w-4" aria-hidden="true" />
                    {resumeData.email}
                  </a>
                  <a href={`tel:${resumeData.phone}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
                    <Phone className="h-4 w-4" aria-hidden="true" />
                    {resumeData.phone}
                  </a>
                  <a href={resumeData.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    LinkedIn
                  </a>
                  <a href={resumeData.github} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
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
                  Certifications
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {resumeData.certifications.map((cert) => (
                  <div key={cert.name} className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50">
                    <div>
                      <p className="font-semibold text-foreground">{cert.name}</p>
                      <p className="text-xs text-muted-foreground">{cert.issuer} · {cert.year}</p>
                    </div>
                    <Badge variant={cert.status === 'active' ? 'success' : 'secondary'} className="text-xs">
                      {cert.status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="h-5 w-5" aria-hidden="true" />
                  Technical Skills
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                {Object.entries(resumeData.skills).map(([category, skills]) => (
                  <div key={category}>
                    <h4 className="mb-2 text-sm font-medium text-muted-foreground">{category}</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {skills.map((skill) => (
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
              <h2 id="summary-title" className="mb-4 text-xl font-semibold">Professional Summary</h2>
              <p className="text-muted-foreground leading-relaxed">{resumeData.summary}</p>
            </section>

            <section aria-labelledby="experience-title">
              <h2 id="experience-title" className="mb-6 text-xl font-semibold">Experience</h2>
              {resumeData.experience.map((job, index) => (
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
                      <h4 className="mb-2 text-sm font-medium">Key Achievements</h4>
                      <ul className="space-y-1 pl-4">
                        {job.achievements.map((achievement) => (
                          <li key={achievement} className="text-sm text-muted-foreground list-disc">
                            {achievement}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {job.technologies.map((tech) => (
                        <Badge key={tech} variant="outline" className="text-xs">{tech}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </section>

            <section aria-labelledby="education-title">
              <h2 id="education-title" className="mb-6 text-xl font-semibold">Education</h2>
              {resumeData.education.map((edu) => (
                <Card key={edu.degree}>
                  <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold">{edu.degree}</h3>
                        <p className="text-primary font-medium">{edu.school}</p>
                        <p className="text-sm text-muted-foreground">{edu.period}</p>
                        <p className="mt-2 text-sm text-muted-foreground">{edu.details}</p>
                      </div>
                      <Badge variant="secondary"><GraduationCap className="h-3 w-3 mr-1.5" aria-hidden="true" />Degree</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </section>

            <section aria-labelledby="projects-title">
              <h2 id="projects-title" className="mb-6 text-xl font-semibold">Key Projects</h2>
              {resumeData.projects.map((project) => (
                <Card key={project.name}>
                  <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold">{project.name}</h3>
                        <p className="mt-1 text-muted-foreground">{project.description}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {project.tech.map((t) => (
                            <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </section>
          </div>
        </div>
      </div>

      <footer className="border-t border-border/50 bg-background/50 py-8">
        <div className="container-wide text-center text-sm text-muted-foreground">
          <p>Last updated: {new Date().toLocaleDateString('pt-BR', { year: 'numeric', month: 'long' })}</p>
          <p className="mt-1">Built with Next.js · Styled with Tailwind · Open source on <a href="https://github.com/blue-sentinel" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">GitHub</a></p>
        </div>
      </footer>
    </div>
  );
}