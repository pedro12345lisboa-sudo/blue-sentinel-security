interface JsonLdProps {
  /** Objeto schema.org ou lista de objetos (mesma página pode ter vários). */
  data: Record<string, unknown> | Record<string, unknown>[];
}

/**
 * Injeta dados estruturados schema.org no HTML.
 *
 * `JSON.stringify` escapa `<`/`>`/`&` como `\u003c` etc., então o conteúdo
 * não pode quebrar o HTML nem ser usado para XSS via `dangerouslySetInnerHTML`.
 */
export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
