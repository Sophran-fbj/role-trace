import type { SourceBlock, SourceDocument } from "@/domain/types";

const normalize = (value: string) => value.replace(/\r\n/g, "\n").trim();

export function segmentDocument(document: SourceDocument): SourceBlock[] {
  const sections = normalize(document.text).split(/\n\s*\n/).map(normalize).filter(Boolean);
  return sections.map((text, index) => ({
    id: `${document.id}:block:${index + 1}`,
    documentId: document.id,
    index,
    heading: text.split("\n")[0].match(/^#{1,6}\s+(.+)/)?.[1],
    text,
  }));
}

export function segmentDocuments(documents: SourceDocument[]) { return documents.flatMap(segmentDocument); }
