/** Shapes shared by the Act reader (server) and its pages and components. */

export type ActAudience = 'public' | 'auditor';

export interface LibraryAct {
  id: number;
  act_name: string;
  short_name: string | null;
  subtitle: string | null;
  act_number: string | null;
  act_year: number | null;
  jurisdiction: string;
  state_name: string | null;
  summary: string | null;
  part_count: number;
  section_count: number;
}

export interface ReaderAmendment { amended_on: string | null; reference: string | null; description: string }

export interface ReaderProvision {
  id: number;
  kind: string;
  number: string | null;
  title: string;
  status: string;
  /** Sanitised HTML written in the editor; falls back to the plain explanation when the text predates the editor. */
  body_html: string | null;
  explanation: string | null;
  amendments: ReaderAmendment[];
  children: ReaderProvision[];
}

/** A chapter or a schedule (or the group of sections that sit directly under the Act, id 0) with the titles of its sections. */
export interface ReaderPart {
  id: number;
  kind: 'Chapter' | 'Schedule' | 'Act';
  number: string | null;
  title: string;
  sections: { id: number; number: string | null; title: string; status: string }[];
}

export interface ReaderHit {
  id: number;
  kind: string;
  number: string | null;
  title: string;
  snippet: string;
  part_id: number;
}

export interface ReaderData {
  act: {
    id: number; act_name: string; short_name: string | null; subtitle: string | null; act_number: string | null; act_year: number | null;
    jurisdiction: string; state_name: string | null; ministry: string | null; department: string | null; effective_date: string | null;
    last_amended_date: string | null; summary: string | null; official_source_url: string | null;
  };
  parts: ReaderPart[];
  /** `intro` is the text of the chapter or schedule itself (a schedule is mostly its own text, with no sections under it). */
  selected: { part: ReaderPart; intro: ReaderProvision | null; provisions: ReaderProvision[]; previous: number | null; next: number | null } | null;
  totals: { parts: number; sections: number };
  hits: ReaderHit[] | null;
  query: string;
}
