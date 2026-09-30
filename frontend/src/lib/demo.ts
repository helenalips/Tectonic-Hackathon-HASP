/**
 * Channel mock content for the Inbox (Outlook) and Slack demos, plus the "compose" quick-start drafts.
 * Client names are real; every contact, message and fact is fictional demo data.
 * The drafts mirror the "compose" section the backend adds to data/seed/demo_inputs.json.
 */
import type { Channel } from "../api/types";

export interface ClientContact {
  name: string;
  email: string;
  role: string;
}

export const CLIENT_CONTACTS: Record<string, ClientContact> = {
  "cl-kaneka": { name: "An Claes", email: "an.claes@kaneka.example", role: "HR manager, Kaneka Belgium" },
  "cl-skhitech": { name: "Joanna Kowalska", email: "joanna.kowalska@skhitech.example", role: "HR director, SK hi-tech" },
  "cl-afriflora": { name: "Meron Haile", email: "meron.haile@afriflora.example", role: "Payroll manager, Afriflora" },
  "cl-cityd": { name: "Tom Vermeersch", email: "tom.vermeersch@cityd-wes.example", role: "HR lead, CityD-WES group" },
  "cl-globalpaint": { name: "Claire Martin", email: "claire.martin@globalpaint.example", role: "EMEA payroll lead, Global Paint" },
};

export interface ComposeDraft {
  id: string;
  label: string;
  client_id: string;
  channel: Channel;
  subject?: string;
  text: string;
  hint: string;
}

export const EMAIL_DRAFTS: ComposeDraft[] = [
  {
    id: "kaneka-full-price",
    label: "Kaneka · invoice at full price",
    hint: "Horizontal conflict with Jan's written 10% discount",
    client_id: "cl-kaneka",
    channel: "email",
    subject: "Invoice for the pay equity audit follow-up",
    text:
      "Dear An,\n\nThank you for confirming the scope of the pay equity audit follow-up for your 350 employees. We will send the invoice next week. The follow-up is invoiced at full price, as per our standard rate card.\n\nWe will also share the adjusted and unadjusted pay gap report per job level by the end of October.\n\nKind regards,\nSofie Maes",
  },
  {
    id: "sk-clocking",
    label: "SK hi-tech · digital clocking proposal",
    hint: "The client declined this scope · 3 clients learned the same",
    client_id: "cl-skhitech",
    channel: "email",
    subject: "Q4 plan: modernising time registration",
    text:
      "Hi Joanna,\n\nAhead of the plant ramp-up, we propose to roll out our digital clocking app for all shifts in Q4, replacing the badge terminals.\n\nWe will load all 650 employees into InnovaHR before the next pay run.\n\nBest regards,\nTomasz Nowak",
  },
  {
    id: "kaneka-overtime",
    label: "Kaneka · overtime premium question",
    hint: "3 clients solved this · 5 people know how",
    client_id: "cl-kaneka",
    channel: "email",
    subject: "Overtime premium for night shifts",
    text:
      "Hi An,\n\nGood question about the overtime premium for night shifts. We are checking how the 150% premium combines with the night-shift allowance and will come back to you this week.\n\nKind regards,\nSofie Maes",
  },
  {
    id: "kaneka-excel",
    label: "Kaneka · pay gap in Excel",
    hint: "Differs from the approach that worked elsewhere",
    client_id: "cl-kaneka",
    channel: "email",
    subject: "Proposal: pay gap calculation",
    text:
      "Dear An,\n\nFor the pay gap report, we propose to calculate the adjusted and unadjusted pay gap manually in Excel, exporting salary data from payroll every quarter.\n\nKind regards,\nSofie Maes",
  },
];

export const CHAT_DRAFTS: ComposeDraft[] = [
  {
    id: "chat-kaneka-price",
    label: "Kaneka invoice at full price?",
    hint: "Checks the promise Jan made",
    client_id: "cl-kaneka",
    channel: "chat",
    text: "Quick check before I send it: the Kaneka audit follow-up goes out at full price, right?",
  },
  {
    id: "chat-overtime",
    label: "Who solved overtime premiums?",
    hint: "Finds 3 clients and their solvers",
    client_id: "cl-kaneka",
    channel: "chat",
    text: "Has anyone solved an overtime premium issue for night shifts? Kaneka asks how the 150% premium combines with the night allowance.",
  },
  {
    id: "chat-sk-clocking",
    label: "Pitch digital clocking to SK?",
    hint: "The client said no before",
    client_id: "cl-skhitech",
    channel: "chat",
    text: "Thinking of pitching our digital clocking app to SK hi-tech for Q4. Any objections?",
  },
];

// ------------------------------------------------------------------ Inbox (Outlook-style)

export interface InboxMessage {
  id: string;
  client_id: string | null;
  from: string;
  fromEmail: string;
  subject: string;
  preview: string;
  body: string;
  date: string;
  unread?: boolean;
  flagged?: boolean;
  /** Quick-start draft to load when the user replies. */
  replyDraft?: string;
}

export const INBOX: InboxMessage[] = [
  {
    id: "m1",
    client_id: "cl-kaneka",
    from: "An Claes",
    fromEmail: "an.claes@kaneka.example",
    subject: "Invoice for the audit follow-up?",
    preview: "Hi Sofie, when can we expect the invoice for the follow-up of the pay equity audit?",
    body: "Hi Sofie,\n\nWhen can we expect the invoice for the follow-up of the pay equity audit? Our finance team is closing the Q3 budget and would like to book it this month.\n\nAlso: any news on the adjusted and unadjusted pay gap report?\n\nThanks,\nAn Claes\nHR manager, Kaneka Belgium",
    date: "09:12",
    unread: true,
    flagged: true,
    replyDraft: "kaneka-full-price",
  },
  {
    id: "m2",
    client_id: "cl-skhitech",
    from: "Joanna Kowalska",
    fromEmail: "joanna.kowalska@skhitech.example",
    subject: "Q4 planning: plant ramp-up",
    preview: "We're preparing Q4. Is there anything you'd recommend for the ramp-up?",
    body: "Hello Tomasz,\n\nWe're preparing the Q4 plan for the plant ramp-up. Is there anything you would recommend on the HR and payroll side before we hire the next group of operators?\n\nBest regards,\nJoanna Kowalska\nHR director, SK hi-tech battery materials Poland",
    date: "08:47",
    unread: true,
    replyDraft: "sk-clocking",
  },
  {
    id: "m3",
    client_id: "cl-kaneka",
    from: "An Claes",
    fromEmail: "an.claes@kaneka.example",
    subject: "Overtime premium on night shifts",
    preview: "Our production team asks how the overtime premium combines with the night allowance.",
    body: "Hi Sofie,\n\nOur production team asks how the overtime premium combines with the night-shift allowance. Is the 150% calculated on base pay or on base pay plus allowance?\n\nThanks,\nAn",
    date: "Yesterday",
    replyDraft: "kaneka-overtime",
  },
  {
    id: "m4",
    client_id: null,
    from: "Jan Peeters",
    fromEmail: "jan.peeters@example.com",
    subject: "FYI: Kaneka commercial terms",
    preview: "Reminder that Kaneka has the 10% returning-customer discount on the audit and follow-up.",
    body: "Hi Sofie,\n\nReminder that Kaneka has the 10% returning-customer discount on the pay equity audit and its follow-up. It's in my email of 14 March 2025.\n\nJan",
    date: "Yesterday",
  },
  {
    id: "m5",
    client_id: "cl-afriflora",
    from: "Meron Haile",
    fromEmail: "meron.haile@afriflora.example",
    subject: "Rest-day overtime rate",
    preview: "Can you confirm the rest-day overtime rate for the September run?",
    body: "Dear team,\n\nCan you confirm the rest-day overtime rate for the September run? Our note says 1.5x but supervisors mention 2x.\n\nRegards,\nMeron",
    date: "Mon",
  },
  {
    id: "m6",
    client_id: "cl-cityd",
    from: "Tom Vermeersch",
    fromEmail: "tom.vermeersch@cityd-wes.example",
    subject: "Thanks for the pay framework",
    preview: "The automated pay gap dashboard saved us days this quarter. Thanks again!",
    body: "Hi Sofie,\n\nThe automated pay gap dashboard saved us days this quarter. Thanks again to you and the team!\n\nTom",
    date: "Mon",
  },
  {
    id: "m7",
    client_id: "cl-globalpaint",
    from: "Claire Martin",
    fromEmail: "claire.martin@globalpaint.example",
    subject: "Payslip layout for Lyon",
    preview: "Could payslips for the Lyon site show worked hours?",
    body: "Hello,\n\nCould payslips for the Lyon site show the worked hours per week?\n\nClaire",
    date: "Fri",
  },
];

// ------------------------------------------------------------------ Slack

export interface SlackChannel {
  id: string;
  name: string;
  kind: "channel" | "dm";
  client_id: string | null;
  topic: string;
  unread?: number;
}

export const SLACK_CHANNELS: SlackChannel[] = [
  { id: "payroll-be", name: "payroll-be", kind: "channel", client_id: null, topic: "Belgian payroll questions and rules", unread: 3 },
  { id: "pay-transparency", name: "pay-transparency", kind: "channel", client_id: null, topic: "EU Pay Transparency Directive: projects and lessons", unread: 1 },
  { id: "clients-kaneka", name: "clients-kaneka", kind: "channel", client_id: "cl-kaneka", topic: "Kaneka Belgium account team" },
  { id: "clients-skhitech", name: "clients-skhitech", kind: "channel", client_id: "cl-skhitech", topic: "SK hi-tech battery materials Poland" },
  { id: "dm-jan", name: "Jan Peeters", kind: "dm", client_id: null, topic: "Direct message" },
  { id: "dm-pieter", name: "Pieter Janssens", kind: "dm", client_id: null, topic: "Direct message" },
  { id: "dm-katarzyna", name: "Katarzyna Wiśniewska", kind: "dm", client_id: null, topic: "Direct message" },
];

export interface SlackMessage {
  id: string;
  author: { id: string; name: string };
  time: string;
  text: string;
  bot?: boolean;
}

export const SLACK_MESSAGES: Record<string, SlackMessage[]> = {
  "payroll-be": [
    { id: "s1", author: { id: "p-bram", name: "Bram Wouters" }, time: "08:31", text: "Morning! Reminder: the JC 200 wage indexation file is due Friday." },
    { id: "s2", author: { id: "p-marc", name: "Marc Dubois" }, time: "08:44", text: "Thanks Bram. Anyone seen a client ask about overtime premiums combined with night allowances lately?" },
    { id: "s3", author: { id: "p-hannah", name: "Hannah Becker" }, time: "08:52", text: "We had it in DE. Short answer: check the threshold first, then configure one premium rule." },
  ],
  "pay-transparency": [
    { id: "s4", author: { id: "p-sofie", name: "Sofie Maes" }, time: "Yesterday", text: "CityD-WES dashboard is live: adjusted and unadjusted pay gap straight from the job architecture." },
    { id: "s5", author: { id: "p-amelie", name: "Amélie Laurent" }, time: "Yesterday", text: "Nice! We did the equal-value bands in Pharma FR the same way. Happy to share the template." },
  ],
  "clients-kaneka": [
    { id: "s6", author: { id: "p-marc", name: "Marc Dubois" }, time: "22 Sep", text: "Billing note added for the audit follow-up." },
    { id: "s7", author: { id: "p-jan", name: "Jan Peeters" }, time: "23 Sep", text: "Careful with the price: Kaneka has a written discount on the audit and its follow-up." },
  ],
  "clients-skhitech": [
    { id: "s8", author: { id: "p-tomasz", name: "Tomasz Nowak" }, time: "Mon", text: "Plant ramp-up is on track. Next hiring wave in November." },
    { id: "s9", author: { id: "p-katarzyna", name: "Katarzyna Wiśniewska" }, time: "Mon", text: "Reminder: time registration is parked until the 2027 review." },
  ],
  "dm-jan": [{ id: "s10", author: { id: "p-jan", name: "Jan Peeters" }, time: "Yesterday", text: "Ping me before anything goes out to Kaneka on pricing." }],
  "dm-pieter": [{ id: "s11", author: { id: "p-pieter", name: "Pieter Janssens" }, time: "Tue", text: "Happy to help with any clocking questions." }],
  "dm-katarzyna": [],
};
