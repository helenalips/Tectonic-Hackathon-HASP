import { ArrowDown, Search, Users } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { errorMessage } from "../../api/client";
import { listPeople, type PersonListItem } from "../../api/people";
import { DemoDataTag } from "../../components/DemoDataTag";
import { Avatar } from "../../components/profile/Avatar";
import { useProfileDrawer } from "../../components/profile/ProfileDrawer";
import { ReliabilityRing } from "../../components/profile/ReliabilityRing";
import { EmptyState, ErrorState } from "../../components/States";
import { useAsync } from "../../lib/useAsync";

function matches(p: PersonListItem, q: string): boolean {
  if (!q) return true;
  const hay = [p.person.name, p.person.role, p.person.team, p.title ?? "", p.location ?? "", ...p.domains].join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
}

/** People directory: search, filter by domain and country, open a profile in the drawer. */
export function PeoplePage() {
  const { data, error, loading, reload } = useAsync(listPeople, []);
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("");
  const [country, setCountry] = useState("");
  const ids = { q: useId(), d: useId(), c: useId() };
  const people = useMemo(() => data ?? [], [data]);

  const domains = useMemo(() => [...new Set(people.flatMap((p) => p.domains))].sort(), [people]);
  const countries = useMemo(() => [...new Set(people.flatMap((p) => p.countries ?? []))].sort(), [people]);

  const filtered = useMemo(
    () =>
      people
        .filter((p) => matches(p, query.trim()))
        .filter((p) => !domain || p.domains.includes(domain))
        .filter((p) => !country || (p.countries ?? []).includes(country))
        .sort((a, b) => b.reliability.score - a.reliability.score || a.person.name.localeCompare(b.person.name)),
    [people, query, domain, country],
  );
  const filtering = query !== "" || domain !== "" || country !== "";

  return (
    <div className="mx-auto w-full max-w-content px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-secondary">
            <ArrowDown aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
            Vertical · Across clients
          </p>
          <h1 className="mt-1 text-heading-m font-bold">People</h1>
          <p className="mt-1 max-w-2xl text-body-s text-textMuted">
            Find who solved a problem before, what they know and how reliable their documents are.
          </p>
        </div>
        <DemoDataTag />
      </header>

      <div className="mt-6 grid gap-3 rounded-lg border border-borderSubtle bg-surface p-4 shadow-1 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <div>
          <label htmlFor={ids.q} className="field-label text-body-xs">
            Search
          </label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-iconMuted" />
            <input
              id={ids.q}
              type="search"
              value={query}
              maxLength={100}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, role, expertise…"
              className="field pl-9"
              autoComplete="off"
            />
          </div>
        </div>
        <div>
          <label htmlFor={ids.d} className="field-label text-body-xs">
            Domain
          </label>
          <select id={ids.d} value={domain} onChange={(e) => setDomain(e.target.value)} className="field sm:w-56">
            <option value="">All domains</option>
            {domains.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={ids.c} className="field-label text-body-xs">
            Country
          </label>
          <select id={ids.c} value={country} onChange={(e) => setCountry(e.target.value)} className="field sm:w-40">
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c === "MULTI" ? "Multi-country" : c}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="btn-ghost"
          disabled={!filtering}
          onClick={() => {
            setQuery("");
            setDomain("");
            setCountry("");
          }}
        >
          Clear
        </button>
      </div>

      <p aria-live="polite" className="mt-4 text-body-xs text-textMuted">
        {!loading && !error && `${filtered.length} ${filtered.length === 1 ? "person" : "people"}`}
      </p>

      <div className="mt-2">
        {error ? (
          <ErrorState message={errorMessage(error)} onRetry={reload} />
        ) : loading && !data ? (
          <ul aria-label="Loading people" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="h-44 animate-pulse rounded-lg border border-borderSubtle bg-surface motion-reduce:animate-none" />
            ))}
          </ul>
        ) : filtered.length === 0 ? (
          <EmptyState title="No people match these filters" icon={Users}>
            Try another domain or clear the search.
          </EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="People">
            {filtered.map((p) => (
              <li key={p.person.id}>
                <PersonCard item={p} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PersonCard({ item: p }: { item: PersonListItem }) {
  const { open } = useProfileDrawer();
  const shown = p.domains.slice(0, 3);
  const more = p.domains.length - shown.length;
  return (
    <button
      type="button"
      onClick={() => open(p.person.id)}
      aria-label={`${p.person.name}, ${p.title || p.person.role}. Open profile`}
      className="group flex h-full w-full flex-col rounded-lg border border-borderSubtle bg-surface p-5 text-left shadow-1 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <span className="flex w-full items-start gap-3">
        <Avatar name={p.person.name} seed={p.person.id} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-body-s font-bold text-heading group-hover:text-primaryPressed">{p.person.name}</span>
          <span className="block truncate text-body-xs text-textMuted">{p.title || p.person.role}</span>
          {p.location && <span className="block truncate text-caption text-textMuted">{p.location}</span>}
        </span>
        <ReliabilityRing score={p.reliability.score} size={40} />
      </span>
      <span className="mt-4 flex flex-wrap gap-1.5">
        {shown.map((d) => (
          <span key={d} className="rounded-full border border-primary/25 bg-primarySubtle px-2.5 py-0.5 text-caption font-medium text-primaryPressed">
            {d}
          </span>
        ))}
        {more > 0 && <span className="rounded-full border border-borderSubtle px-2.5 py-0.5 text-caption text-textMuted">+{more}</span>}
      </span>
      {p.solved_count != null && (
        <span className="mt-auto flex items-center gap-1.5 pt-4 text-caption font-medium text-secondary">
          <ArrowDown aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
          Solved {p.solved_count} case{p.solved_count === 1 ? "" : "s"} across {p.solved_clients_count ?? 0} client
          {p.solved_clients_count === 1 ? "" : "s"}
        </span>
      )}
    </button>
  );
}
