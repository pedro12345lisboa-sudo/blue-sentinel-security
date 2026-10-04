/**
 * Badge de severidade usado nos playbooks de IR.
 *
 * A implementação (variantes de cor + rótulos vindos do modelo de severidade
 * compartilhado do SOC) vive em `components/lab/severity-badge.tsx`; aqui
 * apenas a reexportamos para o pacote de componentes da seção `/playbooks`.
 */
export { SeverityBadge, severityVariant } from '@/components/lab/severity-badge';
