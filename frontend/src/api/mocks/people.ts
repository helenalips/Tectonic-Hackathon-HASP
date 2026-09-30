import type { Category, PersonRef, TopDocument, TrustFactorName, TrustScore } from "../types";
import type { ClientContribution, PersonListItem, PersonProfileV2, SolvedCase } from "../people";

/**
 * Fictional SD Worx people for the directory and profile drawer. Names, roles and documents are
 * invented; client names are real hackathon clients (Kaneka Belgium, CityD-WES group, ...) or
 * anonymised ("Manufacturing client · PL"). Ids of the seed people match backend fixtures.
 */

// Reference date for "x days ago" reasons, kept fixed so the demo is deterministic.
const TODAY = Date.UTC(2026, 8, 30);

const WEIGHTS: Record<TrustFactorName, number> = {
  recency: 0.2,
  ownership: 0.15,
  country_relevance: 0.15,
  author_expertise: 0.2,
  corroboration: 0.15,
  no_open_conflicts: 0.15,
};

interface DocSpec {
  title: string;
  /** ISO date last updated */
  updated: string;
  owner: boolean;
  /** Country match: 1 exact, 0.5 neighbouring/multi, 0 other. */
  country: [number, string];
  /** Author's expertise in this document's domain, 0-1. */
  expertise: number;
  /** Independent sources confirming it. */
  corroborations: number;
  openConflicts: number;
}

function daysSince(iso: string): number {
  const t = Date.parse(iso + "T00:00:00Z");
  return Math.max(0, Math.round((TODAY - t) / 86_400_000));
}

function ago(days: number): string {
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 730) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

function docTrust(d: DocSpec): TrustScore {
  const days = daysSince(d.updated);
  const recency = days <= 90 ? 1 : days <= 365 ? Math.round((1 - (days - 90) / 550) * 100) / 100 : days <= 730 ? 0.3 : 0.1;
  const values: Record<TrustFactorName, [number, string]> = {
    recency: [recency, `Updated ${ago(days)}`],
    ownership: d.owner ? [1, "Owner set and still at SD Worx"] : [0, "No owner assigned"],
    country_relevance: d.country,
    author_expertise: [d.expertise, d.expertise >= 0.8 ? "Author is a recognised expert in this domain" : d.expertise >= 0.5 ? "Author has some experience in this domain" : "Author works mostly in another domain"],
    corroboration: [Math.min(1, d.corroborations / 3), d.corroborations === 0 ? "No other source confirms this yet" : `Confirmed by ${d.corroborations} other source${d.corroborations === 1 ? "" : "s"}`],
    no_open_conflicts: d.openConflicts === 0 ? [1, "No open conflicts"] : [0, `${d.openConflicts} open conflict${d.openConflicts === 1 ? "" : "s"} with other records`],
  };
  const factors = (Object.keys(WEIGHTS) as TrustFactorName[]).map((name) => ({
    name,
    weight: WEIGHTS[name],
    value: values[name][0],
    reason: values[name][1],
  }));
  const score = Math.round(factors.reduce((s, f) => s + f.weight * f.value, 0) * 100);
  return { score, label: score >= 75 ? "Reliable" : score >= 50 ? "Verify" : "Uncertain", factors };
}

const same = (c: string): [number, string] => [1, `Scope matches the client country (${c})`];
const multi = (c: string): [number, string] => [0.5, `Written for ${c}; partly applies elsewhere`];
const other = (c: string): [number, string] => [0, `Written for ${c}; check local rules`];

interface Spec {
  ref: PersonRef;
  email: string;
  title: string;
  location: string;
  languages: string[];
  bio: string;
  years: number;
  domains: string[];
  countries: string[];
  reliability: [number, string[]];
  /** [client_id | "", client_label, hours, first_date, last_date] */
  clients: [string, string, number, string, string][];
  /** [client_label, category, title, date] */
  solved: [string, Category, string, string][];
  docs: DocSpec[];
}

const SPECS: Spec[] = [
  {
    ref: { id: "p-jan", name: "Jan Peeters", role: "Account manager", team: "Commercial Belgium" },
    email: "jan.peeters@example.com",
    title: "Senior account manager",
    location: "Antwerp, Belgium",
    languages: ["Dutch", "French", "English"],
    bio: "Owns the commercial relationship with mid-market clients in Flanders. First point of contact for contract scope, renewals and price indexation.",
    years: 11,
    domains: ["Commercial", "Contract renewals", "Price indexation"],
    countries: ["BE"],
    reliability: [84, ["Owns 6 active client contracts", "Documents confirmed by finance in 9 of 10 cases", "1 contract note older than a year"]],
    clients: [
      ["cl-kaneka", "Kaneka Belgium", 186, "2022-03-01", "2026-09-12"],
      ["cl-cityd", "CityD-WES group", 74, "2025-06-10", "2026-08-28"],
      ["", "Healthcare client · BE", 52, "2024-01-15", "2025-11-30"],
    ],
    solved: [
      ["Kaneka Belgium", "commercial", "Contract scope extended to Wallonia site", "2026-05-20"],
      ["Healthcare client · BE", "commercial", "Price indexation clause clarified after dispute", "2025-10-02"],
      ["CityD-WES group", "commercial", "Merged two service contracts after acquisition", "2026-02-14"],
    ],
    docs: [
      { title: "Kaneka Belgium: service contract 2026 (summary)", updated: "2026-09-12", owner: true, country: same("BE"), expertise: 0.9, corroborations: 3, openConflicts: 0 },
      { title: "Price indexation rules for BE mid-market", updated: "2025-08-01", owner: true, country: same("BE"), expertise: 0.8, corroborations: 2, openConflicts: 1 },
    ],
  },
  {
    ref: { id: "p-sofie", name: "Sofie Maes", role: "Pay transparency consultant", team: "Reward & Compliance BE" },
    email: "sofie.maes@example.com",
    title: "Lead consultant, pay transparency",
    location: "Brussels, Belgium",
    languages: ["Dutch", "French", "English"],
    bio: "Helps clients prepare for the EU Pay Transparency Directive: job architecture, pay gap reporting and joint pay assessments.",
    years: 7,
    domains: ["Pay transparency", "Job architecture", "Pay gap reporting"],
    countries: ["BE", "NL"],
    reliability: [91, ["Solved the same problem at 4 clients", "All documents have an owner", "No open conflicts on her documents"]],
    clients: [
      ["cl-cityd", "CityD-WES group", 142, "2025-11-03", "2026-09-20"],
      ["cl-kaneka", "Kaneka Belgium", 96, "2026-01-12", "2026-09-05"],
      ["", "Retail client · NL", 64, "2025-03-01", "2025-12-18"],
      ["", "Bank · BE", 40, "2024-09-01", "2025-02-28"],
    ],
    solved: [
      ["CityD-WES group", "feature_request", "Pay framework and pay gap reporting after a merger", "2026-03-18"],
      ["Retail client · NL", "problem", "Gender pay gap above 5% in store management", "2025-11-04"],
      ["Kaneka Belgium", "question", "Which job levels fall under the Directive's reporting duty", "2026-06-02"],
      ["Bank · BE", "feature_request", "Salary ranges published in vacancies", "2025-01-20"],
    ],
    docs: [
      { title: "Pay transparency readiness checklist (EU Directive 2023/970)", updated: "2026-08-30", owner: true, country: multi("EU"), expertise: 1, corroborations: 3, openConflicts: 0 },
      { title: "CityD-WES: competence matrix and salary scale", updated: "2026-03-18", owner: true, country: same("BE"), expertise: 1, corroborations: 2, openConflicts: 0 },
      { title: "Pay gap calculation method (joint pay assessment)", updated: "2025-12-01", owner: true, country: multi("EU"), expertise: 0.9, corroborations: 2, openConflicts: 0 },
    ],
  },
  {
    ref: { id: "p-tomasz", name: "Tomasz Nowak", role: "HR system consultant", team: "Implementation Poland" },
    email: "tomasz.nowak@example.com",
    title: "HR system implementation consultant",
    location: "Kraków, Poland",
    languages: ["Polish", "English", "German"],
    bio: "Implements SD Worx HR and time systems for manufacturing clients in Central Europe. Strong on data migration and shift schedules.",
    years: 5,
    domains: ["HR system implementation", "Data migration", "Time & attendance"],
    countries: ["PL", "CZ"],
    reliability: [78, ["Go-lives delivered on time at 3 clients", "2 migration notes have no second reviewer", "Recent documents"]],
    clients: [
      ["cl-skhitech", "SK hi-tech battery materials Poland", 214, "2025-09-01", "2026-09-25"],
      ["", "Manufacturing client · PL", 120, "2024-10-01", "2025-07-31"],
      ["", "Automotive supplier · CZ", 58, "2024-02-01", "2024-09-15"],
    ],
    solved: [
      ["Manufacturing client · PL", "problem", "Four-shift schedule broke overtime calculation", "2025-05-12"],
      ["SK hi-tech battery materials Poland", "problem", "Employee master data duplicated during migration", "2026-04-08"],
      ["Automotive supplier · CZ", "question", "Mapping of Czech absence codes", "2024-08-01"],
    ],
    docs: [
      { title: "Migration runbook: employee master data (PL)", updated: "2026-04-08", owner: true, country: same("PL"), expertise: 0.9, corroborations: 1, openConflicts: 0 },
      { title: "Shift schedule setup for continuous production", updated: "2025-05-12", owner: true, country: same("PL"), expertise: 0.8, corroborations: 2, openConflicts: 0 },
      { title: "Absence code mapping CZ (draft)", updated: "2024-08-01", owner: false, country: other("CZ"), expertise: 0.6, corroborations: 0, openConflicts: 0 },
    ],
  },
  {
    ref: { id: "p-lotte", name: "Lotte de Vries", role: "Multi-country payroll lead", team: "Global Payroll" },
    email: "lotte.devries@example.com",
    title: "Lead, multi-country payroll",
    location: "Amsterdam, Netherlands",
    languages: ["Dutch", "English", "German"],
    bio: "Coordinates payroll across 20+ countries for global clients. Designs the in-country partner model and the monthly consolidated reporting.",
    years: 9,
    domains: ["Multi-country payroll", "Payroll consolidation", "Vendor management"],
    countries: ["NL", "MULTI"],
    reliability: [88, ["Solved cross-border issues at 5 clients", "Documents reviewed each quarter", "1 open conflict on a partner SLA"]],
    clients: [
      ["cl-globalpaint", "Global Paint company", 260, "2024-05-01", "2026-09-26"],
      ["cl-afriflora", "Afriflora", 48, "2025-10-01", "2026-06-30"],
      ["", "Logistics client · DE", 90, "2023-11-01", "2025-04-30"],
    ],
    solved: [
      ["Global Paint company", "problem", "Payroll cut-off dates differ between 14 countries", "2025-09-10"],
      ["Logistics client · DE", "question", "Shadow payroll for employees posted abroad", "2024-12-03"],
      ["Afriflora", "feature_request", "Consolidated payroll report in EUR", "2026-05-22"],
      ["Food producer · ES", "problem", "Currency rounding differences in consolidation", "2025-02-11"],
    ],
    docs: [
      { title: "Global payroll calendar and cut-off policy", updated: "2026-09-01", owner: true, country: multi("multi-country"), expertise: 1, corroborations: 3, openConflicts: 0 },
      { title: "In-country partner SLA template", updated: "2025-06-15", owner: true, country: multi("multi-country"), expertise: 0.9, corroborations: 1, openConflicts: 1 },
    ],
  },
  {
    ref: { id: "p-abebe", name: "Abebe Tesfaye", role: "Payroll consultant", team: "Payroll Ethiopia" },
    email: "abebe.tesfaye@example.com",
    title: "Payroll consultant, East Africa",
    location: "Addis Ababa, Ethiopia",
    languages: ["Amharic", "English"],
    bio: "Runs payroll for horticulture and agriculture clients in Ethiopia and Kenya, including seasonal workers and per-diem pay.",
    years: 4,
    domains: ["Payroll", "Seasonal workforce", "Local tax (ET)"],
    countries: ["ET", "KE"],
    reliability: [72, ["Deep local knowledge (ET)", "Few documents corroborated by a second source", "No open conflicts"]],
    clients: [
      ["cl-afriflora", "Afriflora", 310, "2023-04-01", "2026-09-28"],
      ["", "Agriculture client · KE", 66, "2025-01-10", "2025-08-31"],
    ],
    solved: [
      ["Afriflora", "payroll_rule", "Income tax brackets changed mid-year", "2025-07-15"],
      ["Agriculture client · KE", "problem", "Seasonal workers paid twice after rehire", "2025-06-20"],
    ],
    docs: [
      { title: "Ethiopian income tax brackets 2025/26", updated: "2025-07-15", owner: true, country: same("ET"), expertise: 0.9, corroborations: 1, openConflicts: 0 },
      { title: "Seasonal rehire checklist", updated: "2025-06-20", owner: false, country: multi("ET/KE"), expertise: 0.7, corroborations: 0, openConflicts: 0 },
    ],
  },
  {
    ref: { id: "p-elena", name: "Elena Rossi", role: "Onboarding specialist", team: "Client Onboarding" },
    email: "elena.rossi@example.com",
    title: "Client onboarding specialist",
    location: "Milan, Italy",
    languages: ["Italian", "English", "French"],
    bio: "Guides new clients through their first 100 days: kick-off, data collection, parallel runs and the first live payroll.",
    years: 6,
    domains: ["Onboarding", "Parallel runs", "Project management"],
    countries: ["IT", "BE", "PL"],
    reliability: [81, ["Onboarded 12 clients", "Checklists reused by other teams", "2 checklists need an update"]],
    clients: [
      ["cl-skhitech", "SK hi-tech battery materials Poland", 88, "2025-08-01", "2025-12-15"],
      ["cl-kaneka", "Kaneka Belgium", 40, "2022-02-01", "2022-06-30"],
      ["", "Fashion retailer · IT", 110, "2024-03-01", "2024-10-31"],
    ],
    solved: [
      ["SK hi-tech battery materials Poland", "problem", "Parallel run showed 3% net pay difference", "2025-11-20"],
      ["Fashion retailer · IT", "question", "Which data to collect before the kick-off", "2024-04-10"],
      ["Bank · FR", "complaint", "Client unhappy about onboarding timeline", "2023-09-05"],
    ],
    docs: [
      { title: "Onboarding playbook: first 100 days", updated: "2026-02-10", owner: true, country: multi("all countries"), expertise: 1, corroborations: 3, openConflicts: 0 },
      { title: "Parallel run reconciliation template", updated: "2024-11-05", owner: true, country: multi("all countries"), expertise: 0.8, corroborations: 2, openConflicts: 0 },
    ],
  },
  {
    ref: { id: "p-marc", name: "Marc Dubois", role: "Compliance consultant", team: "Legal & Compliance BE/FR" },
    email: "marc.dubois@example.com",
    title: "Senior compliance consultant",
    location: "Lille, France",
    languages: ["French", "Dutch", "English"],
    bio: "Translates new labour law into payroll and HR settings for Belgium and France. Co-author of the pay transparency legal notes.",
    years: 14,
    domains: ["Compliance", "Pay transparency", "Labour law BE/FR"],
    countries: ["BE", "FR"],
    reliability: [86, ["Legal notes reviewed by legal team", "Long track record (14 years)", "1 note superseded by a newer version"]],
    clients: [
      ["cl-kaneka", "Kaneka Belgium", 58, "2025-02-01", "2026-07-15"],
      ["cl-cityd", "CityD-WES group", 36, "2025-12-01", "2026-04-30"],
      ["", "Bank · FR", 124, "2023-06-01", "2026-03-31"],
    ],
    solved: [
      ["Bank · FR", "question", "Index Egapro vs. EU Directive reporting", "2026-03-02"],
      ["Kaneka Belgium", "payroll_rule", "New end-of-year bonus rule (joint committee 116)", "2025-12-12"],
      ["CityD-WES group", "question", "Right to information on pay level for employees", "2026-04-11"],
    ],
    docs: [
      { title: "Legal note: EU Pay Transparency Directive in BE and FR", updated: "2026-06-20", owner: true, country: multi("BE/FR"), expertise: 1, corroborations: 3, openConflicts: 0 },
      { title: "Joint committee 116: bonus rules 2025", updated: "2025-12-12", owner: true, country: same("BE"), expertise: 0.9, corroborations: 2, openConflicts: 0 },
      { title: "Legal note: pay transparency (v1, superseded)", updated: "2024-05-02", owner: false, country: multi("BE/FR"), expertise: 1, corroborations: 1, openConflicts: 1 },
    ],
  },
  {
    ref: { id: "p-noor", name: "Noor El Amrani", role: "Change management consultant", team: "HR Advisory" },
    email: "noor.elamrani@example.com",
    title: "Change management consultant",
    location: "Ghent, Belgium",
    languages: ["Dutch", "French", "English", "Arabic"],
    bio: "Helps HR teams land new processes and systems: stakeholder maps, training plans and communication to employees.",
    years: 3,
    domains: ["Change management", "Training", "Employee communication"],
    countries: ["BE", "NL"],
    reliability: [69, ["Good client feedback", "Most documents have no second source yet", "Newer to SD Worx (3 years)"]],
    clients: [
      ["cl-cityd", "CityD-WES group", 70, "2026-01-05", "2026-06-30"],
      ["", "Retail client · NL", 44, "2025-04-01", "2025-09-30"],
    ],
    solved: [
      ["CityD-WES group", "complaint", "Employees confused by new salary scale letters", "2026-05-06"],
      ["Retail client · NL", "question", "How to train 300 store managers on a new app", "2025-06-18"],
    ],
    docs: [
      { title: "Communication kit: new pay framework", updated: "2026-05-06", owner: true, country: same("BE"), expertise: 0.8, corroborations: 0, openConflicts: 0 },
      { title: "Training plan template for HR self-service", updated: "2025-06-18", owner: false, country: multi("BE/NL"), expertise: 0.6, corroborations: 1, openConflicts: 0 },
    ],
  },
  {
    ref: { id: "p-katrin", name: "Katrin Schmidt", role: "Time & attendance consultant", team: "Workforce Management DE" },
    email: "katrin.schmidt@example.com",
    title: "Workforce management consultant",
    location: "Munich, Germany",
    languages: ["German", "English"],
    bio: "Configures time registration, shift planning and working time accounts for logistics and production sites.",
    years: 8,
    domains: ["Time & attendance", "Shift planning", "Working time accounts"],
    countries: ["DE", "AT"],
    reliability: [83, ["Solved overtime issues at 3 clients", "Documents recent and owned", "Works council agreements attached"]],
    clients: [
      ["", "Logistics client · DE", 176, "2023-09-01", "2026-08-31"],
      ["", "Manufacturing client · AT", 60, "2025-02-01", "2025-06-30"],
      ["cl-skhitech", "SK hi-tech battery materials Poland", 24, "2026-03-01", "2026-04-15"],
    ],
    solved: [
      ["Logistics client · DE", "problem", "Night shift premiums counted twice", "2026-02-02"],
      ["SK hi-tech battery materials Poland", "problem", "Four-shift schedule broke overtime calculation", "2026-04-10"],
      ["Manufacturing client · AT", "payroll_rule", "Working time account cap per collective agreement", "2025-05-28"],
    ],
    docs: [
      { title: "Overtime and shift premium rules (DE/AT)", updated: "2026-02-02", owner: true, country: multi("DE/AT"), expertise: 0.9, corroborations: 2, openConflicts: 0 },
      { title: "Four-shift model: configuration guide", updated: "2026-04-10", owner: true, country: multi("DE/PL"), expertise: 0.8, corroborations: 2, openConflicts: 0 },
    ],
  },
  {
    ref: { id: "p-pieter", name: "Pieter Janssens", role: "Payroll expert", team: "Payroll Belgium" },
    email: "pieter.janssens@example.com",
    title: "Payroll expert, social security",
    location: "Leuven, Belgium",
    languages: ["Dutch", "French", "English"],
    bio: "Specialist in Belgian social security, joint committees and DmfA declarations. Go-to person for complex payroll rules.",
    years: 17,
    domains: ["Payroll", "Social security BE", "Joint committees"],
    countries: ["BE"],
    reliability: [93, ["17 years of payroll expertise", "Rules confirmed by 3+ sources", "No open conflicts"]],
    clients: [
      ["cl-kaneka", "Kaneka Belgium", 132, "2021-01-01", "2026-09-10"],
      ["cl-cityd", "CityD-WES group", 50, "2024-01-01", "2026-06-30"],
      ["", "Healthcare client · BE", 98, "2022-05-01", "2026-01-31"],
    ],
    solved: [
      ["Kaneka Belgium", "payroll_rule", "New end-of-year bonus rule (joint committee 116)", "2025-12-10"],
      ["Healthcare client · BE", "problem", "DmfA rejected for night work reductions", "2025-03-14"],
      ["CityD-WES group", "question", "Company car benefit after merger", "2024-11-08"],
      ["Bank · BE", "payroll_rule", "Collective bonus plan (CAO 90) calculation", "2025-04-30"],
    ],
    docs: [
      { title: "DmfA error codes and fixes", updated: "2026-07-01", owner: true, country: same("BE"), expertise: 1, corroborations: 3, openConflicts: 0 },
      { title: "Joint committee 116: payroll parameters", updated: "2026-01-15", owner: true, country: same("BE"), expertise: 1, corroborations: 3, openConflicts: 0 },
    ],
  },
  {
    ref: { id: "p-claire", name: "Claire Martin", role: "HR analytics consultant", team: "People Analytics" },
    email: "claire.martin@example.com",
    title: "People analytics consultant",
    location: "Paris, France",
    languages: ["French", "English", "Spanish"],
    bio: "Builds HR dashboards: headcount, absenteeism, pay gap and turnover. Makes sure numbers mean the same thing across countries.",
    years: 5,
    domains: ["HR analytics", "Pay gap reporting", "Dashboards"],
    countries: ["FR", "MULTI"],
    reliability: [77, ["Dashboards used at 4 clients", "1 metric definition in conflict with finance", "Recent documents"]],
    clients: [
      ["cl-globalpaint", "Global Paint company", 90, "2025-05-01", "2026-09-15"],
      ["", "Bank · FR", 72, "2024-06-01", "2025-06-30"],
      ["cl-cityd", "CityD-WES group", 30, "2026-02-01", "2026-03-31"],
    ],
    solved: [
      ["Global Paint company", "feature_request", "One headcount definition across 22 countries", "2026-01-20"],
      ["CityD-WES group", "feature_request", "Pay gap dashboard for the works council", "2026-03-25"],
      ["Bank · FR", "problem", "Absenteeism rate differs from finance report", "2025-02-17"],
    ],
    docs: [
      { title: "Metric dictionary: headcount, FTE, turnover", updated: "2026-01-20", owner: true, country: multi("multi-country"), expertise: 0.9, corroborations: 2, openConflicts: 1 },
      { title: "Pay gap dashboard specification", updated: "2026-03-25", owner: true, country: multi("EU"), expertise: 0.7, corroborations: 1, openConflicts: 0 },
    ],
  },
  {
    ref: { id: "p-samir", name: "Samir Haddad", role: "Integration architect", team: "Integrations" },
    email: "samir.haddad@example.com",
    title: "Integration architect",
    location: "Brussels, Belgium",
    languages: ["French", "English", "Arabic"],
    bio: "Connects SD Worx payroll to client ERP, finance and identity systems. Owns the integration patterns library.",
    years: 10,
    domains: ["Integrations", "HR system implementation", "Data security"],
    countries: ["BE", "MULTI"],
    reliability: [80, ["Pattern library reused widely", "API notes reviewed by security", "2 notes older than a year"]],
    clients: [
      ["cl-globalpaint", "Global Paint company", 150, "2024-09-01", "2026-09-20"],
      ["cl-skhitech", "SK hi-tech battery materials Poland", 45, "2025-10-01", "2026-02-28"],
      ["", "Logistics client · DE", 38, "2024-01-01", "2024-06-30"],
    ],
    solved: [
      ["Global Paint company", "problem", "Journal entries posted twice to the ERP", "2025-10-30"],
      ["SK hi-tech battery materials Poland", "question", "Single sign-on for shop floor terminals", "2026-01-12"],
      ["Logistics client · DE", "problem", "Nightly HR export timed out", "2024-05-20"],
    ],
    docs: [
      { title: "Integration patterns: payroll to ERP", updated: "2025-10-30", owner: true, country: multi("multi-country"), expertise: 1, corroborations: 2, openConflicts: 0 },
      { title: "SSO for shared terminals (draft)", updated: "2024-12-01", owner: false, country: other("PL"), expertise: 0.7, corroborations: 0, openConflicts: 0 },
    ],
  },
  {
    ref: { id: "p-ingrid", name: "Ingrid Olsen", role: "Payroll consultant", team: "Nordics Payroll" },
    email: "ingrid.olsen@example.com",
    title: "Payroll consultant, Nordics",
    location: "Oslo, Norway",
    languages: ["Norwegian", "Swedish", "English"],
    bio: "Handles payroll and A-melding reporting for Norwegian entities of global clients, and holiday pay across the Nordics.",
    years: 6,
    domains: ["Payroll", "Holiday pay", "Multi-country payroll"],
    countries: ["NO", "SE", "DK"],
    reliability: [74, ["Strong local knowledge", "Holiday pay note has an open conflict", "Documents owned"]],
    clients: [
      ["cl-globalpaint", "Global Paint company", 84, "2025-01-01", "2026-09-01"],
      ["", "Retail client · SE", 56, "2024-04-01", "2025-03-31"],
    ],
    solved: [
      ["Global Paint company", "payroll_rule", "Holiday pay accrual for Norwegian staff", "2026-05-15"],
      ["Retail client · SE", "question", "Vacation pay on commission", "2024-10-09"],
    ],
    docs: [
      { title: "Nordic holiday pay rules compared", updated: "2026-05-15", owner: true, country: multi("NO/SE/DK"), expertise: 0.9, corroborations: 1, openConflicts: 1 },
    ],
  },
  {
    ref: { id: "p-marta", name: "Marta Kowalska", role: "Payroll consultant", team: "Payroll Poland" },
    email: "marta.kowalska@example.com",
    title: "Payroll consultant",
    location: "Wrocław, Poland",
    languages: ["Polish", "English"],
    bio: "Runs payroll for manufacturing clients in Poland: ZUS contributions, PPK pension plans and shift allowances.",
    years: 4,
    domains: ["Payroll", "Social security PL", "Shift allowances"],
    countries: ["PL"],
    reliability: [79, ["Confirmed by payroll lead", "Recent documents", "No open conflicts"]],
    clients: [
      ["cl-skhitech", "SK hi-tech battery materials Poland", 190, "2025-10-01", "2026-09-27"],
      ["", "Manufacturing client · PL", 140, "2023-05-01", "2025-09-30"],
    ],
    solved: [
      ["SK hi-tech battery materials Poland", "payroll_rule", "PPK contribution rate change", "2026-04-01"],
      ["Manufacturing client · PL", "problem", "Night shift allowance below legal minimum", "2025-01-22"],
    ],
    docs: [
      { title: "PPK pension plan: payroll setup", updated: "2026-04-01", owner: true, country: same("PL"), expertise: 0.8, corroborations: 2, openConflicts: 0 },
      { title: "Night shift allowance rules (PL)", updated: "2025-01-22", owner: true, country: same("PL"), expertise: 0.8, corroborations: 1, openConflicts: 0 },
    ],
  },
  {
    ref: { id: "p-james", name: "James O'Connor", role: "Payroll consultant", team: "Payroll UK & Ireland" },
    email: "james.oconnor@example.com",
    title: "Senior payroll consultant, UK & IE",
    location: "Dublin, Ireland",
    languages: ["English", "Irish"],
    bio: "Payroll and pensions for UK and Irish entities. Leads the auto-enrolment and gender pay gap reporting work.",
    years: 9,
    domains: ["Payroll", "Pensions", "Pay gap reporting"],
    countries: ["IE", "GB"],
    reliability: [85, ["Gender pay gap reporting since 2018", "Documents reviewed yearly", "No open conflicts"]],
    clients: [
      ["cl-globalpaint", "Global Paint company", 70, "2024-02-01", "2026-08-31"],
      ["", "Software company · IE", 95, "2023-01-01", "2026-06-30"],
    ],
    solved: [
      ["Software company · IE", "feature_request", "Gender pay gap report for Irish entity", "2025-12-01"],
      ["Global Paint company", "problem", "Pension auto-enrolment missed for new starters", "2025-03-19"],
    ],
    docs: [
      { title: "Gender pay gap reporting: IE and UK compared", updated: "2025-12-01", owner: true, country: multi("IE/GB"), expertise: 1, corroborations: 2, openConflicts: 0 },
      { title: "Auto-enrolment checklist (UK)", updated: "2025-03-19", owner: true, country: other("GB"), expertise: 0.9, corroborations: 1, openConflicts: 0 },
    ],
  },
  {
    ref: { id: "p-lucia", name: "Lucía García", role: "HR policy consultant", team: "HR Advisory ES" },
    email: "lucia.garcia@example.com",
    title: "HR policy consultant",
    location: "Madrid, Spain",
    languages: ["Spanish", "English", "Catalan"],
    bio: "Writes HR policies and equality plans for Spanish entities: registro retributivo, remote work and time registration.",
    years: 3,
    domains: ["HR policy", "Pay transparency", "Equality plans"],
    countries: ["ES"],
    reliability: [64, ["Good local expertise", "Several drafts without an owner", "Few confirmations yet"]],
    clients: [
      ["", "Food producer · ES", 80, "2025-03-01", "2026-07-31"],
      ["cl-globalpaint", "Global Paint company", 22, "2026-05-01", "2026-06-30"],
    ],
    solved: [
      ["Food producer · ES", "feature_request", "Pay register (registro retributivo) set up", "2025-11-12"],
      ["Global Paint company", "question", "Spanish equality plan versus EU Directive", "2026-06-10"],
    ],
    docs: [
      { title: "Registro retributivo: how to build it", updated: "2025-11-12", owner: true, country: same("ES"), expertise: 0.8, corroborations: 1, openConflicts: 0 },
      { title: "Equality plan template (draft)", updated: "2024-06-01", owner: false, country: same("ES"), expertise: 0.6, corroborations: 0, openConflicts: 1 },
    ],
  },
  {
    ref: { id: "p-hannah", name: "Hannah Vermeer", role: "Data protection officer", team: "Privacy & Security" },
    email: "hannah.vermeer@example.com",
    title: "Data protection consultant",
    location: "Utrecht, Netherlands",
    languages: ["Dutch", "English", "German"],
    bio: "Advises on GDPR in HR and payroll: retention periods, data processing agreements and data subject requests.",
    years: 8,
    domains: ["GDPR", "Data security", "Compliance"],
    countries: ["NL", "BE", "MULTI"],
    reliability: [89, ["Notes approved by legal", "Used by 6 client teams", "No open conflicts"]],
    clients: [
      ["cl-afriflora", "Afriflora", 20, "2026-02-01", "2026-03-15"],
      ["cl-kaneka", "Kaneka Belgium", 18, "2025-09-01", "2025-10-15"],
      ["", "Healthcare client · BE", 46, "2024-05-01", "2025-01-31"],
    ],
    solved: [
      ["Healthcare client · BE", "question", "Retention period for medical certificates", "2024-11-20"],
      ["Kaneka Belgium", "problem", "Payslips sent to a former employee's address", "2025-10-01"],
      ["Afriflora", "question", "Transfer of payroll data outside the EU", "2026-03-05"],
    ],
    docs: [
      { title: "HR data retention periods (BE/NL)", updated: "2026-03-05", owner: true, country: multi("BE/NL"), expertise: 1, corroborations: 3, openConflicts: 0 },
      { title: "International data transfer checklist", updated: "2026-03-05", owner: true, country: multi("multi-country"), expertise: 0.9, corroborations: 2, openConflicts: 0 },
    ],
  },
];

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function build(spec: Spec): PersonProfileV2 {
  const reliability = { score: spec.reliability[0], reasons: spec.reliability[1] };
  const contributions: ClientContribution[] = spec.clients.map(([client_id, client_label, hours, first_date, last_date]) => ({
    person: spec.ref,
    hours,
    first_date,
    last_date,
    domains: spec.domains,
    reliability,
    client_id: client_id || undefined,
    client_label,
  }));
  const solved_cases: SolvedCase[] = spec.solved.map(([client_label, category, title, date]) => ({
    dossier_item_id: `di-${spec.ref.id.slice(2)}-${slug(title)}`.slice(0, 60),
    client_label,
    category,
    title,
    date,
  }));
  const documents: TopDocument[] = spec.docs.map((d) => ({ id: `doc-${spec.ref.id.slice(2)}-${slug(d.title)}`, title: d.title, trust: docTrust(d) }));
  return {
    person: spec.ref,
    domains: spec.domains,
    countries: spec.countries,
    reliability,
    contributions,
    title: spec.title,
    location: spec.location,
    languages: spec.languages,
    bio: spec.bio,
    years_at_sdworx: spec.years,
    solved_cases,
    documents,
    clients_count: new Set(spec.clients.map((c) => c[1])).size,
    total_hours: spec.clients.reduce((s, c) => s + c[2], 0),
    email: spec.email,
  };
}

const PROFILES: Map<string, PersonProfileV2> = new Map(SPECS.map((s) => [s.ref.id, build(s)]));

export function mockPersonProfile(id: string): PersonProfileV2 | null {
  const p = PROFILES.get(id);
  return p ? structuredClone(p) : null;
}

export function mockListPeople(): PersonListItem[] {
  return [...PROFILES.values()].map((p) => ({
    person: p.person,
    domains: p.domains,
    countries: p.countries,
    reliability: p.reliability,
    title: p.title,
    location: p.location,
    solved_count: p.solved_cases.length,
    solved_clients_count: new Set(p.solved_cases.map((c) => c.client_label)).size,
  }));
}
