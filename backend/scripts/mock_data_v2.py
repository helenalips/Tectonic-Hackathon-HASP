"""TrustGrid v2 mock data (all fictional, source "generated"). Imported by scripts.parse_mock_data.

- 4 clearly fictional extra clients next to the 5 real client names from mock-cases.md.
- 9 extra SD Worx people (fictional, @example.com) + profile fields for every person (profiles.json).
- ~70 extra documents, 2023-2026, with varying trust (unowned, wrong country, old, confirmed several times).
- 8 recurring problem types, each at 3+ clients, solved by different people (vertical dimension).
- Horizontal traps for the live draft check: Kaneka 10% discount, SK hi-tech declined digital time
  registration, agreed payroll cut-off days, SLA promises, fixed contact persons, go-live dates and
  invoice payment terms.

Content rules (so the deterministic extractor only records intended facts): a phrase like "N employees"
is a headcount, "N% discount" is a discount, "cut-off ... the 20th" is a cut-off day, "payable within N days"
is an invoice term, and "decided to keep paper time registration" is a declined scope.
"""
from __future__ import annotations


def _doc(id, client_id, type, title, created, author, owner, country, content):
    return {"id": id, "client_id": client_id, "type": type, "title": title, "content": content,
            "author_id": author, "owner_id": owner, "country_scope": country,
            "created_at": created, "updated_at": created, "status": "active", "source": "generated"}


def _item(id, client_id, category, title, description, status, resolution, created_by, created_at, docs):
    return {"id": id, "client_id": client_id, "category": category, "title": title, "description": description,
            "status": status, "resolution": resolution, "created_by": created_by, "created_at": created_at,
            "linked_document_ids": docs}


# --------------------------------------------------------------------------- clients (fictional)

EXTRA_CLIENTS = [
    {"id": "cl-nordvik", "name": "Nordvik Logistics", "country": "BE", "sector": "Logistics", "segment": "enterprise",
     "source": "generated",
     "summary": "Situation: Belgian subsidiary of a fictional Norwegian logistics group with depots in Antwerp, Ghent and "
                "Liege; drivers, warehouse crews and office staff on shifts. Approach: managed payroll with time "
                "registration exports from the planning tool. Challenges: overtime and Sunday premiums, drivers without "
                "smartphones, late planner inputs. Outcome: stable payroll with automated premium checks and depot kiosks."},
    {"id": "cl-helio", "name": "Helio Retail Group", "country": "NL", "sector": "Retail", "segment": "enterprise",
     "source": "generated",
     "summary": "Situation: fictional Dutch retail chain that grew through acquisitions and ended up with three payroll "
                "vendors. Approach: consolidation into one payroll design on SD Worx, go-live planned for January 2027. "
                "Challenges: store colleagues without smartphones, mid-month cut-off disputes, pay transparency. "
                "Outcome: in progress; pay gap report delivered, store tablets live."},
    {"id": "cl-maas", "name": "Maas & Partners Care", "country": "BE", "sector": "Healthcare", "segment": "mid_market",
     "source": "generated",
     "summary": "Situation: fictional Belgian care group with nursing homes and home care. Approach: payroll and HR "
                "advisory under the healthcare collective agreements. Challenges: retroactive barema corrections, "
                "night and weekend premiums, works council approval for time registration. Outcome: automated retro "
                "calculation and an approved time registration policy."},
    {"id": "cl-alpenwerk", "name": "Alpenwerk Tools", "country": "DE", "sector": "Industrial tools", "segment": "mid_market",
     "source": "generated",
     "summary": "Situation: fictional German-Austrian toolmaker with two plants and two local payroll vendors. Approach: "
                "one payroll provider for both countries, live since April 2026. Challenges: works council agreement "
                "on time registration, overtime supplements, leave balances after migration. Outcome: live, with a "
                "pay transparency project starting."},
]

# --------------------------------------------------------------------------- people (fictional)

EXTRA_PEOPLE = [
    {"id": "p-katrin", "name": "Katrin Huber", "role": "Senior payroll consultant", "team": "DACH Payroll",
     "email": "katrin@example.com", "domains": ["payroll", "time_management", "multi_country_payroll"], "countries": ["DE", "AT"]},
    {"id": "p-ruben", "name": "Ruben Claes", "role": "Senior payroll consultant", "team": "BE Logistics & Transport",
     "email": "ruben@example.com", "domains": ["payroll", "time_management"], "countries": ["BE"]},
    {"id": "p-femke", "name": "Femke Jansen", "role": "Implementation lead", "team": "NL Implementation",
     "email": "femke@example.com", "domains": ["hr_system_implementation", "multi_country_payroll", "payroll"], "countries": ["NL", "BE"]},
    {"id": "p-piotr", "name": "Piotr Zielinski", "role": "Payroll specialist", "team": "PL Payroll Operations",
     "email": "piotr@example.com", "domains": ["payroll", "compliance"], "countries": ["PL"]},
    {"id": "p-an", "name": "An Wouters", "role": "Payroll consultant healthcare", "team": "BE Public & Care",
     "email": "an@example.com", "domains": ["payroll", "compliance"], "countries": ["BE"]},
    {"id": "p-lars", "name": "Lars Eriksen", "role": "Account manager", "team": "Benelux & Nordics Commercial",
     "email": "lars@example.com", "domains": ["commercial"], "countries": ["BE", "NO", "DE"]},
    {"id": "p-pieter", "name": "Pieter Bakker", "role": "Account manager", "team": "NL Commercial",
     "email": "pieter@example.com", "domains": ["commercial"], "countries": ["NL"]},
    {"id": "p-ines", "name": "Ines Laurent", "role": "Pay transparency advisor", "team": "Reward & Pay Equity",
     "email": "ines@example.com", "domains": ["pay_transparency", "compliance"], "countries": ["BE", "FR", "NL"]},
    {"id": "p-daan", "name": "Daan Mertens", "role": "Change and adoption consultant", "team": "BE Consulting",
     "email": "daan@example.com", "domains": ["change_management", "time_management"], "countries": ["BE", "DE"]},
]

# Profile fields for PersonProfileV2 (keyed by person id; read at request time by GET /people/{id}).
PROFILES = {
    "p-jan": {"title": "Account manager Belgium", "location": "Antwerp, BE", "languages": ["Dutch", "English", "French"],
              "bio": "Owns the commercial relationship with mid-market clients in Flanders. Writes the proposals, "
                     "discounts and renewals that later turn into records.", "years_at_sdworx": 11},
    "p-sofie": {"title": "Payroll & reward consultant", "location": "Ghent, BE", "languages": ["Dutch", "English"],
                "bio": "Builds pay frameworks and pay gap reporting on top of payroll data. Led the CityD-WES pay "
                       "framework and the Kaneka pay transparency project.", "years_at_sdworx": 7},
    "p-tomasz": {"title": "HR system consultant", "location": "Wroclaw, PL", "languages": ["Polish", "English", "German"],
                 "bio": "Implements SD Worx InnovaHR for manufacturing plants: migration, time management and Polish "
                        "declarations.", "years_at_sdworx": 6},
    "p-lotte": {"title": "Team lead multi-country payroll", "location": "Utrecht, NL", "languages": ["Dutch", "English", "German"],
                "bio": "Leads vendor consolidation programmes: from dozens of local payroll vendors to one "
                       "multinational provider.", "years_at_sdworx": 12},
    "p-abebe": {"title": "Payroll consultant Ethiopia", "location": "Addis Ababa, ET", "languages": ["Amharic", "English"],
                "bio": "Local payroll and labour-law expert for East Africa; supports large agricultural "
                       "workforces.", "years_at_sdworx": 4},
    "p-elena": {"title": "Onboarding and self-service specialist", "location": "Milan, IT", "languages": ["Italian", "English", "Spanish"],
                "bio": "Designs onboarding and self-service for frontline workers, including kiosks and shared "
                       "devices for people without smartphones.", "years_at_sdworx": 8},
    "p-marc": {"title": "Compliance advisor", "location": "Brussels, BE", "languages": ["French", "Dutch", "English"],
               "bio": "Labour-law and pay transparency compliance for Belgium and France; reviews collective "
                      "agreement rules and works council files.", "years_at_sdworx": 15},
    "p-noor": {"title": "Change consultant", "location": "Mechelen, BE", "languages": ["Dutch", "English", "Arabic"],
               "bio": "Helps HR teams and managers adopt new pay and self-service processes.", "years_at_sdworx": 5},
    "p-katrin": {"title": "Senior payroll consultant DACH", "location": "Munich, DE", "languages": ["German", "English"],
                 "bio": "German and Austrian payroll, collective agreement supplements and works council "
                        "agreements on time registration.", "years_at_sdworx": 9},
    "p-ruben": {"title": "Senior payroll consultant logistics", "location": "Antwerp, BE", "languages": ["Dutch", "French", "English"],
                "bio": "Shift-based payroll for transport and logistics: overtime, Sunday and night premiums, "
                       "planner inputs and cut-offs.", "years_at_sdworx": 10},
    "p-femke": {"title": "Implementation lead Netherlands", "location": "Amsterdam, NL", "languages": ["Dutch", "English"],
                "bio": "Leads payroll implementations and migrations for retail and hospitality, including "
                       "leave balance reconciliation.", "years_at_sdworx": 6},
    "p-piotr": {"title": "Payroll specialist Poland", "location": "Katowice, PL", "languages": ["Polish", "English"],
                "bio": "Polish payroll operations: overtime, ZUS corrections and cut-off discipline for plants.",
                "years_at_sdworx": 3},
    "p-an": {"title": "Payroll consultant healthcare", "location": "Leuven, BE", "languages": ["Dutch", "French", "English"],
             "bio": "Healthcare payroll under the IFIC classification: barema changes, indexation and retroactive "
                    "corrections.", "years_at_sdworx": 8},
    "p-lars": {"title": "Account manager Benelux & Nordics", "location": "Brussels, BE", "languages": ["Norwegian", "English", "Dutch"],
               "bio": "Commercial owner for logistics and industrial clients with Nordic or German parents.",
               "years_at_sdworx": 5},
    "p-pieter": {"title": "Account manager Netherlands", "location": "Rotterdam, NL", "languages": ["Dutch", "English"],
                 "bio": "Commercial owner for Dutch retail clients.", "years_at_sdworx": 2},
    "p-ines": {"title": "Pay transparency advisor", "location": "Lille, FR", "languages": ["French", "English", "Dutch"],
               "bio": "Designs pay gap reporting under the EU Pay Transparency Directive: job architecture, "
                      "categories of workers and joint pay assessments.", "years_at_sdworx": 4},
    "p-daan": {"title": "Change and adoption consultant", "location": "Hasselt, BE", "languages": ["Dutch", "German", "English"],
               "bio": "Works council consultations, communication packs and pilots for new time registration.",
               "years_at_sdworx": 6},
    "p-admin": {"title": "Platform administrator", "location": "Brussels, BE", "languages": ["English"],
                "bio": "Technical administrator of the TrustGrid demo.", "years_at_sdworx": None},
}

# --------------------------------------------------------------------------- documents

EXTRA_DOCUMENTS = [
    # ================= Kaneka Belgium: cut-off, invoice terms, SLA, retro corrections
    _doc("doc-kaneka-addendum", "cl-kaneka", "contract", "Addendum framework agreement Kaneka Belgium - terms",
         "2024-12-05T09:00:00Z", "p-jan", "p-jan", "BE",
         "Addendum to the framework agreement with Kaneka Belgium. Invoices are payable within 30 days of the invoice "
         "date. The payroll cut-off is on the 20th of each month: changes received after the 20th are processed in the "
         "next payroll run."),
    _doc("doc-kaneka-retro-ticket", "cl-kaneka", "ticket", "Ticket KB-1182: CLA increase not applied to shift workers",
         "2025-02-05T08:20:00Z", "p-sofie", "p-sofie", "BE",
         "Kaneka HR reports that the January increase from the chemical sector agreement was not applied to the shift "
         "workers. Retroactive salary corrections are needed for January and February."),
    _doc("doc-kaneka-retro-solution", "cl-kaneka", "solution", "Solution: automated retro calculation after the CLA increase",
         "2025-02-20T16:00:00Z", "p-sofie", "p-sofie", "BE",
         "Retroactive salary corrections after the collective agreement increase: we configured the automated retro "
         "calculation in the payroll engine, so the back pay for January and February was calculated and paid "
         "automatically in the March run. The payslip shows the retro lines separately."),
    _doc("doc-kaneka-service-review", "cl-kaneka", "meeting", "Service review Kaneka Belgium Q3 2025",
         "2025-09-18T14:00:00Z", "p-jan", "p-jan", "BE",
         "Service review with Kaneka HR. The support response time of 24 hours was met for every ticket this quarter. "
         "The contact person remains Jan Peeters for commercial questions."),
    _doc("doc-kaneka-cutoff-reminder", "cl-kaneka", "email", "Reminder: payroll cut-off stays on the 20th",
         "2026-01-15T09:10:00Z", "p-sofie", "p-sofie", "BE",
         "Dear Kaneka HR team, a short reminder for the new year: the payroll cut-off stays on the 20th. Changes that "
         "arrive later are processed in the next run. Kind regards, Sofie Maes"),

    # ================= CityD-WES group: open retro question
    _doc("doc-cityd-retro-question", "cl-cityd", "email", "Question: retroactive indexation for consultants",
         "2026-07-02T10:30:00Z", "p-noor", "p-noor", "BE",
         "CityD-WES HR asks how to handle retroactive salary corrections after the indexation for consultants who "
         "changed function level in the same month. They currently correct the back pay by hand."),

    # ================= Afriflora: leave balances after migration, kiosk pilot
    _doc("doc-afriflora-leave-ticket", "cl-afriflora", "ticket", "Ticket AF-310: leave balances wrong after migration",
         "2025-03-03T07:45:00Z", "p-abebe", "p-abebe", "ET",
         "After the migration to SAP SuccessFactors the annual leave balances of farm workers do not match the balances "
         "in the old Excel files. Site HR receives many complaints at the farms."),
    _doc("doc-afriflora-leave-solution", "cl-afriflora", "solution", "Solution: leave balance reconciliation per farm",
         "2025-04-10T12:00:00Z", "p-abebe", "p-abebe", "ET",
         "Leave balance mismatch after migration: we reconciled the opening balances per worker against the last "
         "approved Excel balances, loaded the corrections with a one-off import with an audit trail, and had site HR "
         "sign off per farm. Balances now match and new leave requests use the corrected balance."),
    _doc("doc-afriflora-kiosk-pilot", "cl-afriflora", "visit", "Visit: shared kiosk pilot at two farms",
         "2026-03-10T09:00:00Z", "p-elena", "p-elena", "ET",
         "Pilot of shared kiosks at two farms so workers without smartphones can see payslips and leave balances with "
         "their badge and a PIN. Site HR reports good use during breaks. A decision on the other farms follows the pilot."),

    # ================= Global Paint company: service review
    _doc("doc-gp-service-review", "cl-globalpaint", "meeting", "Quarterly service review Global Paint",
         "2025-11-05T13:00:00Z", "p-lotte", "p-lotte", "MULTI",
         "Quarterly service review with the global payroll lead. SLA: response within 24 hours, met for almost all "
         "tickets. The regional shared service centres now report one error log for all countries."),

    # ================= SK hi-tech battery materials Poland: declined time registration, overtime, leave, cut-off
    _doc("doc-sk-leave-ticket", "cl-skhitech", "ticket", "Ticket SK-077: carry-over leave missing after migration",
         "2024-04-02T07:30:00Z", "p-tomasz", "p-tomasz", "PL",
         "After the data migration from the previous provider, the carry-over leave from 2023 is missing in InnovaHR "
         "for the production teams. The leave balance shown in self-service does not match the old system."),
    _doc("doc-sk-leave-solution", "cl-skhitech", "solution", "Solution: re-import of carry-over leave balances",
         "2024-04-15T15:00:00Z", "p-tomasz", "p-tomasz", "PL",
         "Leave balance mismatch after the data migration: we re-imported the carry-over balances from the previous "
         "provider with an audit trail and added a reconciliation report that compares old and new leave balances per "
         "person before every migration wave."),
    _doc("doc-sk-overtime-ticket", "cl-skhitech", "ticket", "Ticket SK-214: overtime premium missing for the night shift",
         "2024-11-06T06:50:00Z", "p-piotr", "p-piotr", "PL",
         "Overtime premium missing on the October payslips for the night shift on the separator line. The overtime "
         "supplement was not calculated for hours above the shift schedule."),
    _doc("doc-sk-overtime-solution", "cl-skhitech", "solution", "Solution: separate wage type and validation for overtime",
         "2024-11-20T14:00:00Z", "p-piotr", "p-piotr", "PL",
         "Root cause: overtime hours from the paper time sheets were entered late and booked as normal hours. Fix: a "
         "separate wage type for overtime hours, an automated validation report that compares scheduled and worked "
         "hours before each run, and a correction run for October."),
    _doc("doc-sk-overtime-followup", "cl-skhitech", "solution", "Follow-up: overtime check in InnovaHR time management",
         "2024-12-05T10:00:00Z", "p-tomasz", "p-tomasz", "PL",
         "Follow-up on the missing overtime premium: the validation of overtime hours is now an automated check in "
         "InnovaHR time management. Shift leaders confirm overtime before the payroll inputs are closed."),
    _doc("doc-sk-cutoff-meeting", "cl-skhitech", "meeting", "Meeting: dispute about late variable pay inputs",
         "2025-03-11T11:00:00Z", "p-piotr", "p-piotr", "PL",
         "Plant managers delivered variable pay inputs after the deadline and disputed that the corrections were paid "
         "a month later. Agreed with HR: the payroll cut-off is on the 22nd; late inputs are paid in the next run "
         "through a correction line."),
    _doc("doc-sk-cutoff-solution", "cl-skhitech", "solution", "Solution: cut-off calendar and reminders for plant managers",
         "2025-04-02T09:00:00Z", "p-piotr", "p-piotr", "PL",
         "Mid-month cut-off disputes solved with a published cut-off calendar, automated reminders to plant managers "
         "three working days before the deadline, and a correction line on the next payslip for late inputs."),
    _doc("doc-sk-timereg-workshop", "cl-skhitech", "meeting", "Workshop: shopfloor time registration options",
         "2025-05-20T10:00:00Z", "p-tomasz", "p-tomasz", "PL",
         "Workshop with SK hi-tech HR and plant management on shopfloor time registration. Today shift workers fill in "
         "paper time sheets that the shift leaders sign. We presented badge terminals at the entrances linked to "
         "InnovaHR time management, with an estimate of the hardware budget."),
    _doc("doc-sk-timereg-decision", "cl-skhitech", "meeting", "Steering committee: shopfloor keeps paper time registration",
         "2025-06-17T15:00:00Z", "p-tomasz", "p-tomasz", "PL",
         "Steering committee decision: the client decided to keep paper time registration for the shopfloor. Reasons: "
         "the works council wants a separate consultation, and the investment budget for 2025 and 2026 is committed to "
         "the second production line. Do not propose a digital clocking system before the 2027 budget round."),
    _doc("doc-sk-timereg-email", "cl-skhitech", "email", "Confirmation: no digital clocking before the 2027 budget",
         "2025-06-20T08:30:00Z", "p-tomasz", "p-tomasz", "PL",
         "Dear HR team, as decided in the steering committee of 17 June 2025, the shopfloor keeps paper time "
         "registration. We will not propose a digital clocking system before the 2027 budget. Office staff keep using "
         "InnovaHR time management. Kind regards, Tomasz Nowak"),

    # ================= Nordvik Logistics (fictional, BE)
    _doc("doc-nordvik-contract", "cl-nordvik", "contract", "Service agreement Nordvik Logistics Belgium",
         "2023-11-06T09:00:00Z", "p-lars", "p-lars", "BE",
         "Service agreement between SD Worx and Nordvik Logistics Belgium for managed payroll. Scope: 1,400 employees "
         "(drivers, warehouse crews and office staff), processed monthly. SLA: response within 4 hours for incidents "
         "that block a payroll run. Contact person: Ruben Claes. Payment terms of 30 days."),
    _doc("doc-nordvik-old-policy", "cl-nordvik", "policy", "Travel expense policy (Norway) used as reference",
         "2023-02-01T08:00:00Z", "p-lars", None, "NO",
         "Travel expense policy of the Norwegian parent company, shared as a reference for the Belgian drivers. Daily "
         "allowances follow Norwegian state rates. Not reviewed against Belgian rules."),
    _doc("doc-nordvik-overtime-ticket", "cl-nordvik", "ticket", "Ticket NV-903: overtime and Sunday premium missing",
         "2024-02-12T07:15:00Z", "p-ruben", "p-ruben", "BE",
         "Overtime premium missing on the January payslips of the warehouse night shifts. The Sunday supplement was "
         "also not applied for the depot in Ghent."),
    _doc("doc-nordvik-overtime-solution", "cl-nordvik", "solution", "Solution: premium codes mapped to wage types",
         "2024-03-01T15:30:00Z", "p-ruben", "p-ruben", "BE",
         "We mapped the overtime and Sunday premium codes from the planning tool export to dedicated wage types and "
         "added an automated check that flags worked hours above contract hours without a premium. Missing premiums "
         "for January were paid in a correction run."),
    _doc("doc-nordvik-overtime-review", "cl-nordvik", "solution", "Review: premium rules against the transport sector agreement",
         "2024-03-20T11:00:00Z", "p-marc", "p-marc", "BE",
         "Compliance review of the overtime and Sunday premium rules against the transport sector agreement. The "
         "automated premium calculation matches the sector rules; one rule for split shifts was corrected."),
    _doc("doc-nordvik-kiosk-request", "cl-nordvik", "email", "Drivers without smartphones cannot see payslips",
         "2024-05-06T08:00:00Z", "p-ruben", "p-ruben", "BE",
         "Many drivers have no smartphone or do not want to install an app, so they cannot see their payslips online. "
         "The depots ask for an alternative to paper payslips."),
    _doc("doc-nordvik-kiosk-solution", "cl-nordvik", "solution", "Solution: depot kiosks and printed payslips on request",
         "2024-09-15T13:00:00Z", "p-elena", "p-elena", "BE",
         "Self-service alternative for workers without smartphones: a kiosk in every depot canteen with badge and PIN "
         "login for payslips and leave requests, plus printed payslips on request. Adoption after two months: most "
         "drivers use the kiosk at least once a month."),
    _doc("doc-nordvik-kiosk-rollout", "cl-nordvik", "solution", "Follow-up: kiosk rollout and depot communication",
         "2024-10-10T10:00:00Z", "p-ruben", "p-ruben", "BE",
         "Rollout of the depot kiosks to Liege and Ghent with a short instruction card per driver and a helpdesk hour "
         "on payday. Paper payslips dropped sharply."),
    _doc("doc-nordvik-cutoff-meeting", "cl-nordvik", "meeting", "Meeting: late planner inputs and the cut-off",
         "2024-10-10T14:00:00Z", "p-ruben", "p-ruben", "BE",
         "Dispute about the mid-month cut-off: trip allowances and overtime reported by planners after the deadline "
         "were paid a month late. Agreed with Nordvik HR: the payroll cut-off is on the 18th."),
    _doc("doc-nordvik-cutoff-solution", "cl-nordvik", "solution", "Solution: planner reminders and a correction window",
         "2024-11-04T09:30:00Z", "p-ruben", "p-ruben", "BE",
         "Cut-off disputes solved with an automated reminder to planners two days before the deadline, a locked "
         "input screen after the cut-off, and one correction window per month for exceptional cases."),
    _doc("doc-nordvik-retro-ticket", "cl-nordvik", "ticket", "Ticket NV-1120: indexation back pay for drivers",
         "2025-01-20T07:40:00Z", "p-ruben", "p-ruben", "BE",
         "The January indexation was applied late for drivers; retroactive salary corrections and back pay are needed "
         "for the first two weeks of January."),
    _doc("doc-nordvik-retro-solution", "cl-nordvik", "solution", "Solution: retro run for the indexation",
         "2025-02-12T12:00:00Z", "p-ruben", "p-ruben", "BE",
         "Retroactive corrections after the indexation were calculated with the automated retro calculation in the "
         "payroll engine and paid in the February run, with separate retro lines on the payslip."),
    _doc("doc-nordvik-worksc", "cl-nordvik", "meeting", "Works council: time registration from the planning tool",
         "2025-04-24T10:00:00Z", "p-daan", "p-daan", "BE",
         "The works council asked for guarantees before time registration data from the planning tool is used for "
         "payroll: purpose limitation, access rights and a test period."),
    _doc("doc-nordvik-worksc-solution", "cl-nordvik", "solution", "Solution: works council approval for time registration",
         "2025-06-05T15:00:00Z", "p-daan", "p-daan", "BE",
         "Works council approval obtained for the use of time registration data in payroll after a consultation pack, "
         "a privacy impact assessment and a two-month test period in one depot."),
    _doc("doc-nordvik-service-review", "cl-nordvik", "visit", "Service review Nordvik Logistics 2026",
         "2026-05-12T10:00:00Z", "p-lars", "p-lars", "BE",
         "Annual service review. SLA: response within 4 hours met for payroll-blocking incidents. Contact person "
         "remains Ruben Claes. The payroll cut-off is on the 18th and planners respect it."),

    # ================= Helio Retail Group (fictional, NL)
    _doc("doc-helio-rfp", "cl-helio", "meeting", "RFP workshop: three payroll vendors after acquisitions",
         "2025-01-14T09:00:00Z", "p-pieter", "p-pieter", "NL",
         "Helio Retail Group runs stores in the Netherlands and Belgium and, after two acquisitions, works with three "
         "payroll vendors with different pay calendars and wage types. Goal: one payroll design and one provider."),
    _doc("doc-helio-contract", "cl-helio", "contract", "Framework agreement Helio Retail Group",
         "2025-04-01T09:00:00Z", "p-pieter", "p-pieter", "NL",
         "Framework agreement between SD Worx and Helio Retail Group. SD Worx becomes the single payroll provider for "
         "the Dutch and Belgian entities. Scope: 9,000 employees. Go-live date: 1 January 2027. Invoices are payable "
         "within 45 days. Contact person on the SD Worx side: Femke Jansen."),
    _doc("doc-helio-consolidation-design", "cl-helio", "solution", "Design: one payroll design for three vendors",
         "2025-06-10T13:00:00Z", "p-lotte", "p-lotte", "NL",
         "Consolidation design: the pay calendars, wage types and leave schemes of the three legacy vendors are "
         "harmonised into one payroll design, with one integrated data model for both countries."),
    _doc("doc-helio-cutoff-dispute", "cl-helio", "email", "Store managers dispute the mid-month cut-off",
         "2025-05-15T08:30:00Z", "p-femke", "p-femke", "NL",
         "Store managers dispute the mid-month cut-off: shift changes and overtime entered after the deadline are paid a "
         "month late, and store colleagues complain."),
    _doc("doc-helio-cutoff-solution", "cl-helio", "solution", "Solution: fixed cut-off and a second correction window",
         "2025-06-03T10:00:00Z", "p-femke", "p-femke", "NL",
         "Agreed with Helio HR: the payroll cut-off is on the 15th, with a second correction window for shift changes "
         "and an automated reminder to store managers. Late changes appear as correction lines on the next payslip."),
    _doc("doc-helio-smartphone-ticket", "cl-helio", "ticket", "Ticket HR-5521: store colleagues without smartphones",
         "2025-08-12T07:00:00Z", "p-femke", "p-femke", "NL",
         "Store colleagues without a smartphone cannot open their payslips or request leave online. Store managers "
         "print payslips by hand."),
    _doc("doc-helio-paygap-request", "cl-helio", "email", "Request: pay gap report for the pay transparency directive",
         "2025-09-02T09:15:00Z", "p-noor", "p-noor", "NL",
         "Helio HR needs an adjusted and unadjusted pay gap report per category of workers for the EU Pay Transparency "
         "Directive, for both the Dutch and the Belgian entities."),
    _doc("doc-helio-steerco", "cl-helio", "meeting", "Steering committee Helio: go-live and scope",
         "2025-10-08T14:00:00Z", "p-femke", "p-femke", "NL",
         "Steering committee confirmed the go-live date of 1 January 2027 for both countries. Helio decided to keep its "
         "own shift planning tool and declined the shift planning module; only worked hours flow into payroll."),
    _doc("doc-helio-tablets", "cl-helio", "solution", "Solution: shared tablets in every store",
         "2025-11-20T11:00:00Z", "p-elena", "p-elena", "NL",
         "Self-service alternative for store colleagues without smartphones: a shared tablet in every back office with "
         "badge login for payslips and leave requests, and a store champion who helps colleagues the first time."),
    _doc("doc-helio-tablets-followup", "cl-helio", "solution", "Follow-up: store champions and adoption figures",
         "2025-12-15T09:00:00Z", "p-femke", "p-femke", "NL",
         "Follow-up on the shared store tablets: every store has a champion, and printed payslips dropped to a few per "
         "store per month."),
    _doc("doc-helio-consolidation-solution", "cl-helio", "solution", "Solution: migration plan from three vendors",
         "2025-12-02T15:00:00Z", "p-femke", "p-femke", "NL",
         "Migration plan from the three legacy vendors: two parallel runs, one reconciliation per entity, and "
         "a phased switch-off of the old vendors after the first stable run on SD Worx."),
    _doc("doc-helio-paygap-solution", "cl-helio", "solution", "Solution: pay gap report from one integrated system",
         "2026-02-18T16:00:00Z", "p-ines", "p-ines", "NL",
         "Delivered the pay gap report from one integrated system: job families and pay grades act as the job "
         "architecture, and the adjusted and unadjusted pay gap is calculated automatically per category of workers."),
    _doc("doc-helio-paygap-comms", "cl-helio", "solution", "Follow-up: manager pack for the pay gap report",
         "2026-03-05T10:00:00Z", "p-noor", "p-noor", "NL",
         "Manager communication pack for the pay gap report: how to read the categories of workers, what to say to "
         "store colleagues, and where to send questions."),
    _doc("doc-helio-invoice-reminder", "cl-helio", "email", "Invoice reminder Helio Retail Group",
         "2026-03-02T08:00:00Z", "p-pieter", "p-pieter", "NL",
         "Friendly reminder to Helio finance: invoices are payable within 45 days, as in the framework agreement."),
    _doc("doc-helio-leave-ticket", "cl-helio", "ticket", "Ticket HR-6010: leave balances differ after dry-run migration",
         "2026-08-20T07:30:00Z", "p-femke", "p-femke", "NL",
         "In the second dry-run migration the leave balances of store colleagues from one legacy vendor differ from the "
         "balances in the new system. The go-live date of 1 January 2027 stays in place."),

    # ================= Maas & Partners Care (fictional, BE)
    _doc("doc-maas-unowned-note", "cl-maas", "note", "Draft note: care allowance rules",
         "2023-05-10T12:00:00Z", "p-jan", None, "BE",
         "Draft note on care allowances for night and weekend shifts. Not checked against the current sector "
         "agreement. Owner unknown."),
    _doc("doc-maas-contract", "cl-maas", "contract", "Service agreement Maas & Partners Care",
         "2024-02-01T09:00:00Z", "p-jan", "p-jan", "BE",
         "Service agreement between SD Worx and Maas & Partners Care for payroll and HR advisory. Scope: 900 employees, "
         "processed monthly. Invoices are payable within 60 days. Contact person: An Wouters. Support response time: "
         "24 hours."),
    _doc("doc-maas-retro-ticket", "cl-maas", "ticket", "Ticket MPC-221: wrong back pay after the barema update",
         "2024-03-05T08:00:00Z", "p-an", "p-an", "BE",
         "Retroactive salary corrections after the IFIC barema update and the January indexation for nurses were "
         "calculated manually and the back pay was wrong for several wards."),
    _doc("doc-maas-retro-solution", "cl-maas", "solution", "Solution: automated retro calculation for IFIC baremas",
         "2024-04-12T15:00:00Z", "p-an", "p-an", "BE",
         "We replaced the manual Excel corrections with the automated retro calculation in the payroll engine: the new "
         "IFIC baremas are loaded with their effective date, and the back pay is calculated per month automatically."),
    _doc("doc-maas-retro-review", "cl-maas", "solution", "Review: retro corrections and the sector agreement",
         "2024-05-02T10:00:00Z", "p-marc", "p-marc", "BE",
         "Compliance review of the retro corrections against the healthcare sector agreement: the automated retro "
         "calculation respects the effective dates; the works council received a short explanation."),
    _doc("doc-maas-smartphone-ticket", "cl-maas", "ticket", "Ticket MPC-340: care staff without a smartphone",
         "2024-08-20T07:00:00Z", "p-noor", "p-noor", "BE",
         "Care staff without a company smartphone cannot use the payslip app; many do not want to use a private phone."),
    _doc("doc-maas-smartphone-solution", "cl-maas", "solution", "Solution: ward computers and SMS codes",
         "2024-10-01T11:00:00Z", "p-noor", "p-noor", "BE",
         "Self-service alternative for staff without a smartphone: login with an SMS code on shared ward computers, and "
         "printed payslips on request through the secretariat."),
    _doc("doc-maas-overtime-ticket", "cl-maas", "ticket", "Ticket MPC-512: weekend premium missing on payslips",
         "2025-01-14T07:20:00Z", "p-an", "p-an", "BE",
         "Overtime premium missing on the December payslips of night and weekend shifts in two nursing homes."),
    _doc("doc-maas-overtime-solution", "cl-maas", "solution", "Solution: premium rules per shift type",
         "2025-02-03T14:00:00Z", "p-an", "p-an", "BE",
         "The premium rules per shift type were missing for two new nursing homes. We added them to the payroll "
         "configuration, paid the missing premiums in a correction run and added an automated check on premium "
         "hours per shift."),
    _doc("doc-maas-worksc", "cl-maas", "meeting", "Works council: new time registration for nursing staff",
         "2025-03-18T10:00:00Z", "p-marc", "p-marc", "BE",
         "The works council must approve the new time registration for nursing staff before it can be used for "
         "payroll. Questions about privacy, access and the use of the data for evaluations."),
    _doc("doc-maas-worksc-solution", "cl-maas", "solution", "Solution: works council approval with a pilot on two wards",
         "2025-05-06T15:00:00Z", "p-marc", "p-marc", "BE",
         "Works council approval for the time registration obtained after a consultation pack, a privacy impact "
         "assessment and a pilot on two wards. The data is only used for payroll and planning."),
    _doc("doc-maas-worksc-pilot", "cl-maas", "solution", "Follow-up: pilot evaluation for the works council",
         "2025-04-22T09:00:00Z", "p-daan", "p-daan", "BE",
         "Pilot evaluation on two wards for the works council: registration takes less than a minute per shift and "
         "nobody used the data for evaluations."),
    _doc("doc-maas-paygap-request", "cl-maas", "meeting", "Meeting: pay gap per category of workers",
         "2025-06-10T13:00:00Z", "p-ines", "p-ines", "BE",
         "Maas HR needs an adjusted and unadjusted pay gap report per category of workers under the EU Pay "
         "Transparency Directive, based on the IFIC job classification."),
    _doc("doc-maas-paygap-solution", "cl-maas", "solution", "Solution: pay gap report on the IFIC job classification",
         "2025-10-21T16:00:00Z", "p-marc", "p-marc", "BE",
         "Pay gap report delivered from one integrated system: the IFIC job classification is the job architecture, "
         "and the adjusted and unadjusted gap is calculated automatically per category of workers."),

    # ================= Alpenwerk Tools (fictional, DE/AT)
    _doc("doc-alpen-at-policy", "cl-alpenwerk", "policy", "Leave policy Austria (used for the German plant)",
         "2024-01-10T08:00:00Z", "p-katrin", None, "AT",
         "Austrian leave policy with leave counted in working days. Shared as a reference for the German plant; not "
         "reviewed against German rules."),
    _doc("doc-alpen-contract", "cl-alpenwerk", "contract", "Payroll agreement Alpenwerk Tools",
         "2025-02-03T09:00:00Z", "p-lars", "p-lars", "DE",
         "SD Worx becomes the single payroll provider for the German and Austrian entities of Alpenwerk Tools, "
         "replacing two local vendors. Scope: 1,100 employees, processed monthly. Go-live date: 1 April 2026. "
         "Contact person: Katrin Huber."),
    _doc("doc-alpen-consolidation-design", "cl-alpenwerk", "solution", "Design: two vendors into one payroll",
         "2025-06-30T12:00:00Z", "p-lotte", "p-lotte", "DE",
         "Consolidation design for two local vendors: one payroll calendar, harmonised wage types for both "
         "countries and one integrated reporting layer."),
    _doc("doc-alpen-worksc", "cl-alpenwerk", "meeting", "Works council: time registration interface",
         "2025-09-09T10:00:00Z", "p-katrin", "p-katrin", "DE",
         "The works council (Betriebsrat) must approve the time registration interface to payroll. It asks for a "
         "works agreement on purpose, retention and access."),
    _doc("doc-alpen-worksc-solution", "cl-alpenwerk", "solution", "Solution: works agreement on time registration",
         "2025-11-25T15:00:00Z", "p-katrin", "p-katrin", "DE",
         "Works agreement (Betriebsvereinbarung) on time registration signed: purpose limited to payroll and planning, "
         "access rights per role, and a review after one year."),
    _doc("doc-alpen-worksc-comms", "cl-alpenwerk", "solution", "Follow-up: communication pack for the works council",
         "2025-11-10T09:00:00Z", "p-daan", "p-daan", "DE",
         "Communication pack and Q&A for the works council meeting on time registration, in German."),
    _doc("doc-alpen-golive", "cl-alpenwerk", "visit", "Go-live visit Alpenwerk Tools",
         "2026-04-15T10:00:00Z", "p-katrin", "p-katrin", "DE",
         "Both countries went live on 1 April 2026. The first run was stable; open points are overtime supplements and "
         "leave balances."),
    _doc("doc-alpen-leave-ticket", "cl-alpenwerk", "ticket", "Ticket AW-88: leave balances in days versus hours",
         "2026-04-22T07:30:00Z", "p-katrin", "p-katrin", "DE",
         "Leave balances differ after the migration: the Austrian vendor kept leave in working days, the German vendor "
         "in hours."),
    _doc("doc-alpen-leave-solution", "cl-alpenwerk", "solution", "Solution: one leave unit and a reconciliation",
         "2026-06-02T14:00:00Z", "p-femke", "p-femke", "DE",
         "Leave balance mismatch after migration solved: all balances converted to one unit with the conversion rule "
         "agreed with HR, a reconciliation report per person, and sign-off per plant."),
    _doc("doc-alpen-overtime-ticket", "cl-alpenwerk", "ticket", "Ticket AW-104: overtime supplement missing in April",
         "2026-05-06T07:00:00Z", "p-katrin", "p-katrin", "DE",
         "Overtime premium missing on the April payslips at the German plant: the overtime supplement from the "
         "collective agreement was not calculated."),
    _doc("doc-alpen-overtime-solution", "cl-alpenwerk", "solution", "Solution: collective agreement supplements mapped",
         "2026-05-18T15:00:00Z", "p-katrin", "p-katrin", "DE",
         "The overtime supplement rules from the collective agreement were not mapped after the migration. We mapped "
         "them to wage types with an automated premium calculation from the attendance data and paid the missing "
         "supplements in May."),
    _doc("doc-alpen-paygap-request", "cl-alpenwerk", "email", "Request: pay gap report for Germany and Austria",
         "2026-07-14T09:00:00Z", "p-ines", "p-ines", "DE",
         "Alpenwerk HR needs an adjusted and unadjusted pay gap report for the EU Pay Transparency Directive for both "
         "countries, based on the job architecture of the collective agreement."),
]

# --------------------------------------------------------------------------- dossier items

_R = "resolved"
_O = "open"

EXTRA_DOSSIER_ITEMS = [
    # Kaneka
    _item("di-kaneka-retro", "cl-kaneka", "problem", "CLA increase not applied: retroactive corrections",
          "The January collective agreement increase was not applied to shift workers; retroactive salary corrections needed.",
          _R, "Automated retro calculation in the payroll engine; back pay paid automatically in the next run with "
              "separate retro lines on the payslip.",
          "p-sofie", "2025-02-05T08:20:00Z", ["doc-kaneka-retro-ticket", "doc-kaneka-retro-solution"]),
    # CityD
    _item("di-cityd-retro", "cl-cityd", "question", "Retroactive indexation for consultants who changed level",
          "How to handle retroactive salary corrections after indexation when a consultant changed function level; "
          "back pay is corrected by hand today.",
          _O, None, "p-noor", "2026-07-02T10:30:00Z", ["doc-cityd-retro-question"]),
    # Afriflora
    _item("di-afriflora-leave", "cl-afriflora", "problem", "Leave balances wrong after migration",
          "Annual leave balances of farm workers do not match the old Excel balances after the migration.",
          _R, "Opening balances reconciled per worker against the last approved balances, one-off correction import "
              "with audit trail, sign-off per farm.",
          "p-abebe", "2025-03-03T07:45:00Z", ["doc-afriflora-leave-ticket", "doc-afriflora-leave-solution"]),
    # SK hi-tech
    _item("di-sk-leave", "cl-skhitech", "problem", "Carry-over leave missing after migration",
          "Carry-over leave balances are missing after the data migration from the previous provider.",
          _R, "Re-imported carry-over balances with an audit trail and a reconciliation report per migration wave.",
          "p-tomasz", "2024-04-02T07:30:00Z", ["doc-sk-leave-ticket", "doc-sk-leave-solution"]),
    _item("di-sk-overtime", "cl-skhitech", "problem", "Overtime premium missing on night shift payslips",
          "The overtime premium is missing on payslips for hours above the shift schedule.",
          _R, "Separate wage type for overtime hours, automated validation of scheduled versus worked hours before each "
              "run, correction run for the missing premiums.",
          "p-piotr", "2024-11-06T06:50:00Z", ["doc-sk-overtime-ticket", "doc-sk-overtime-solution", "doc-sk-overtime-followup"]),
    _item("di-sk-cutoff", "cl-skhitech", "complaint", "Dispute about late variable pay inputs and the cut-off",
          "Plant managers dispute that late variable pay inputs after the mid-month cut-off are paid a month later.",
          _R, "Published cut-off calendar, automated reminders before the deadline, correction line for late inputs.",
          "p-piotr", "2025-03-11T11:00:00Z", ["doc-sk-cutoff-meeting", "doc-sk-cutoff-solution"]),
    _item("di-sk-timereg", "cl-skhitech", "feature_request", "Digital time registration for the shopfloor",
          "Options for badge terminals or digital clocking on the shopfloor instead of paper time sheets.",
          _R, "Declined by the client in June 2025: the shopfloor keeps paper time registration; no digital clocking "
              "proposal before the 2027 budget round.",
          "p-tomasz", "2025-05-20T10:00:00Z", ["doc-sk-timereg-workshop", "doc-sk-timereg-decision", "doc-sk-timereg-email"]),
    # Nordvik
    _item("di-nordvik-overtime", "cl-nordvik", "problem", "Overtime and Sunday premium missing on payslips",
          "Overtime premium and Sunday supplement missing on payslips of warehouse night shifts.",
          _R, "Premium codes from the planning tool mapped to dedicated wage types, automated check on worked hours "
              "without a premium, correction run, compliance review against the sector agreement.",
          "p-ruben", "2024-02-12T07:15:00Z",
          ["doc-nordvik-overtime-ticket", "doc-nordvik-overtime-solution", "doc-nordvik-overtime-review"]),
    _item("di-nordvik-kiosk", "cl-nordvik", "feature_request", "Self-service for drivers without smartphones",
          "Drivers without a smartphone cannot see payslips online and need an alternative to paper.",
          _R, "Kiosk in every depot canteen with badge and PIN login, printed payslips on request, helpdesk hour on payday.",
          "p-ruben", "2024-05-06T08:00:00Z",
          ["doc-nordvik-kiosk-request", "doc-nordvik-kiosk-solution", "doc-nordvik-kiosk-rollout"]),
    _item("di-nordvik-cutoff", "cl-nordvik", "complaint", "Late planner inputs paid a month late",
          "Mid-month cut-off dispute: trip allowances and overtime reported after the deadline are paid a month late.",
          _R, "Automated reminder to planners before the deadline, locked input screen after the cut-off, one correction "
              "window per month.",
          "p-ruben", "2024-10-10T14:00:00Z", ["doc-nordvik-cutoff-meeting", "doc-nordvik-cutoff-solution"]),
    _item("di-nordvik-retro", "cl-nordvik", "problem", "Indexation back pay for drivers",
          "The indexation was applied late; retroactive salary corrections and back pay needed.",
          _R, "Automated retro calculation in the payroll engine, paid in the next run with separate retro lines.",
          "p-ruben", "2025-01-20T07:40:00Z", ["doc-nordvik-retro-ticket", "doc-nordvik-retro-solution"]),
    _item("di-nordvik-worksc", "cl-nordvik", "question", "Works council approval for time registration data",
          "The works council wants guarantees before time registration data from the planning tool is used for payroll.",
          _R, "Consultation pack, privacy impact assessment and a test period in one depot; works council approved.",
          "p-daan", "2025-04-24T10:00:00Z", ["doc-nordvik-worksc", "doc-nordvik-worksc-solution"]),
    # Helio
    _item("di-helio-consolidation", "cl-helio", "problem", "Three payroll vendors after acquisitions",
          "Three payroll vendors with different pay calendars and wage types; no single payroll process.",
          _R, "One harmonised payroll design and data model, parallel runs, reconciliation per entity and a phased "
              "switch-off of the legacy vendors.",
          "p-pieter", "2025-01-14T09:00:00Z",
          ["doc-helio-rfp", "doc-helio-consolidation-design", "doc-helio-consolidation-solution"]),
    _item("di-helio-cutoff", "cl-helio", "complaint", "Store managers dispute the mid-month cut-off",
          "Shift changes and overtime entered after the mid-month cut-off are paid a month late.",
          _R, "Fixed cut-off, a second correction window for shift changes and automated reminders to store managers.",
          "p-femke", "2025-05-15T08:30:00Z", ["doc-helio-cutoff-dispute", "doc-helio-cutoff-solution"]),
    _item("di-helio-smartphone", "cl-helio", "feature_request", "Self-service for store colleagues without smartphones",
          "Store colleagues without a smartphone cannot open payslips or request leave online.",
          _R, "Shared tablet in every store back office with badge login, and a store champion per store.",
          "p-femke", "2025-08-12T07:00:00Z",
          ["doc-helio-smartphone-ticket", "doc-helio-tablets", "doc-helio-tablets-followup"]),
    _item("di-helio-paygap", "cl-helio", "feature_request", "Adjusted and unadjusted pay gap report",
          "HR needs an adjusted and unadjusted pay gap report per category of workers for the EU Pay Transparency Directive.",
          _R, "Pay gap report from one integrated system with job families and pay grades as job architecture; gap "
              "calculated automatically per category of workers, plus a manager communication pack.",
          "p-noor", "2025-09-02T09:15:00Z",
          ["doc-helio-paygap-request", "doc-helio-paygap-solution", "doc-helio-paygap-comms"]),
    _item("di-helio-leave", "cl-helio", "problem", "Leave balances differ after dry-run migration",
          "Leave balances of store colleagues from one legacy vendor differ after the dry-run migration.",
          _O, None, "p-femke", "2026-08-20T07:30:00Z", ["doc-helio-leave-ticket"]),
    # Maas
    _item("di-maas-retro", "cl-maas", "problem", "Wrong back pay after barema update and indexation",
          "Retroactive salary corrections after the barema update and indexation were calculated manually and were wrong.",
          _R, "Automated retro calculation in the payroll engine with the new baremas loaded by effective date; "
              "compliance review against the sector agreement.",
          "p-an", "2024-03-05T08:00:00Z", ["doc-maas-retro-ticket", "doc-maas-retro-solution", "doc-maas-retro-review"]),
    _item("di-maas-smartphone", "cl-maas", "feature_request", "Self-service for care staff without a smartphone",
          "Care staff without a company smartphone cannot use the payslip app.",
          _R, "SMS-code login on shared ward computers and printed payslips on request.",
          "p-noor", "2024-08-20T07:00:00Z", ["doc-maas-smartphone-ticket", "doc-maas-smartphone-solution"]),
    _item("di-maas-overtime", "cl-maas", "problem", "Weekend and night premium missing on payslips",
          "Overtime premium missing on payslips of night and weekend shifts in two nursing homes.",
          _R, "Premium rules per shift type added, correction run, automated check on premium hours per shift.",
          "p-an", "2025-01-14T07:20:00Z", ["doc-maas-overtime-ticket", "doc-maas-overtime-solution"]),
    _item("di-maas-worksc", "cl-maas", "question", "Works council approval for time registration",
          "The works council must approve the new time registration for nursing staff before payroll use.",
          _R, "Consultation pack, privacy impact assessment and a pilot on two wards; works council approved.",
          "p-marc", "2025-03-18T10:00:00Z", ["doc-maas-worksc", "doc-maas-worksc-pilot", "doc-maas-worksc-solution"]),
    _item("di-maas-paygap", "cl-maas", "feature_request", "Pay gap report per category of workers",
          "HR needs an adjusted and unadjusted pay gap report per category of workers based on the job classification.",
          _R, "Delivered from one integrated system with the job classification as job architecture; gap calculated "
              "automatically per category of workers.",
          "p-ines", "2025-06-10T13:00:00Z", ["doc-maas-paygap-request", "doc-maas-paygap-solution"]),
    # Alpenwerk
    _item("di-alpen-consolidation", "cl-alpenwerk", "problem", "Two local payroll vendors for Germany and Austria",
          "Two local payroll vendors with different calendars and wage types for the German and Austrian entities.",
          _R, "One payroll provider, one payroll calendar, harmonised wage types and one integrated reporting layer.",
          "p-lars", "2025-02-03T09:00:00Z", ["doc-alpen-contract", "doc-alpen-consolidation-design", "doc-alpen-golive"]),
    _item("di-alpen-worksc", "cl-alpenwerk", "question", "Works council approval for the time registration interface",
          "The works council must approve the time registration interface to payroll.",
          _R, "Works agreement on purpose, retention and access rights, prepared with a communication pack.",
          "p-katrin", "2025-09-09T10:00:00Z", ["doc-alpen-worksc", "doc-alpen-worksc-comms", "doc-alpen-worksc-solution"]),
    _item("di-alpen-leave", "cl-alpenwerk", "problem", "Leave balances in days versus hours after migration",
          "Leave balances differ after the migration because the vendors used different leave units.",
          _R, "All balances converted to one unit, reconciliation report per person and sign-off per plant.",
          "p-katrin", "2026-04-22T07:30:00Z", ["doc-alpen-leave-ticket", "doc-alpen-leave-solution"]),
    _item("di-alpen-overtime", "cl-alpenwerk", "problem", "Overtime supplement missing after go-live",
          "Overtime premium missing on payslips after the migration: collective agreement supplements not calculated.",
          _R, "Collective agreement supplements mapped to wage types with an automated premium calculation from the "
              "attendance data; missing supplements paid in the next run.",
          "p-katrin", "2026-05-06T07:00:00Z", ["doc-alpen-overtime-ticket", "doc-alpen-overtime-solution"]),
    _item("di-alpen-paygap", "cl-alpenwerk", "feature_request", "Pay gap report for Germany and Austria",
          "HR needs an adjusted and unadjusted pay gap report for the EU Pay Transparency Directive for both countries.",
          _O, None, "p-ines", "2026-07-14T09:00:00Z", ["doc-alpen-paygap-request"]),
]

# --------------------------------------------------------------------------- contributions (hours per person per client)

EXTRA_CONTRIBUTIONS = [
    {"person_id": "p-piotr", "client_id": "cl-skhitech", "hours": 118.0, "first_date": "2024-10-01", "last_date": "2025-04-02"},
    {"person_id": "p-lars", "client_id": "cl-nordvik", "hours": 46.0, "first_date": "2023-09-12", "last_date": "2026-05-12"},
    {"person_id": "p-ruben", "client_id": "cl-nordvik", "hours": 386.0, "first_date": "2023-11-06", "last_date": "2026-05-12"},
    {"person_id": "p-elena", "client_id": "cl-nordvik", "hours": 52.0, "first_date": "2024-06-03", "last_date": "2024-09-15"},
    {"person_id": "p-marc", "client_id": "cl-nordvik", "hours": 14.0, "first_date": "2024-03-11", "last_date": "2024-03-20"},
    {"person_id": "p-daan", "client_id": "cl-nordvik", "hours": 40.0, "first_date": "2025-04-01", "last_date": "2025-06-05"},
    {"person_id": "p-pieter", "client_id": "cl-helio", "hours": 58.0, "first_date": "2024-11-20", "last_date": "2026-03-02"},
    {"person_id": "p-femke", "client_id": "cl-helio", "hours": 412.0, "first_date": "2025-04-01", "last_date": "2026-08-20"},
    {"person_id": "p-lotte", "client_id": "cl-helio", "hours": 76.0, "first_date": "2025-05-05", "last_date": "2025-07-15"},
    {"person_id": "p-elena", "client_id": "cl-helio", "hours": 64.0, "first_date": "2025-09-01", "last_date": "2025-11-20"},
    {"person_id": "p-ines", "client_id": "cl-helio", "hours": 88.0, "first_date": "2025-10-01", "last_date": "2026-02-18"},
    {"person_id": "p-noor", "client_id": "cl-helio", "hours": 36.0, "first_date": "2025-09-02", "last_date": "2026-03-05"},
    {"person_id": "p-jan", "client_id": "cl-maas", "hours": 22.0, "first_date": "2023-04-03", "last_date": "2024-02-01"},
    {"person_id": "p-an", "client_id": "cl-maas", "hours": 298.0, "first_date": "2024-02-01", "last_date": "2026-06-30"},
    {"person_id": "p-marc", "client_id": "cl-maas", "hours": 71.0, "first_date": "2024-04-15", "last_date": "2025-10-21"},
    {"person_id": "p-noor", "client_id": "cl-maas", "hours": 44.0, "first_date": "2024-08-20", "last_date": "2024-10-01"},
    {"person_id": "p-daan", "client_id": "cl-maas", "hours": 28.0, "first_date": "2025-03-18", "last_date": "2025-04-22"},
    {"person_id": "p-ines", "client_id": "cl-maas", "hours": 33.0, "first_date": "2025-06-10", "last_date": "2025-10-21"},
    {"person_id": "p-lars", "client_id": "cl-alpenwerk", "hours": 31.0, "first_date": "2024-11-04", "last_date": "2025-02-03"},
    {"person_id": "p-katrin", "client_id": "cl-alpenwerk", "hours": 344.0, "first_date": "2024-01-10", "last_date": "2026-07-14"},
    {"person_id": "p-lotte", "client_id": "cl-alpenwerk", "hours": 48.0, "first_date": "2025-05-12", "last_date": "2025-06-30"},
    {"person_id": "p-femke", "client_id": "cl-alpenwerk", "hours": 39.0, "first_date": "2026-04-22", "last_date": "2026-06-02"},
    {"person_id": "p-daan", "client_id": "cl-alpenwerk", "hours": 18.0, "first_date": "2025-10-20", "last_date": "2025-11-10"},
    {"person_id": "p-ines", "client_id": "cl-alpenwerk", "hours": 12.0, "first_date": "2026-07-14", "last_date": "2026-07-28"},
    {"person_id": "p-ruben", "client_id": "cl-kaneka", "hours": 6.0, "first_date": "2025-02-10", "last_date": "2025-02-14"},
    {"person_id": "p-noor", "client_id": "cl-cityd", "hours": 9.0, "first_date": "2026-07-02", "last_date": "2026-07-10"},
    {"person_id": "p-abebe", "client_id": "cl-globalpaint", "hours": 12.0, "first_date": "2025-03-03", "last_date": "2025-03-20"},
]

# --------------------------------------------------------------------------- live draft check demo inputs (POST /check)

COMPOSE_INPUTS = [
    {"id": "compose-a", "scenario": "Horizontal conflict + rewrite: full price and 60-day terms vs Jan's 10% discount and 30-day terms",
     "login": "sofie@example.com", "client_id": "cl-kaneka", "channel": "email",
     "subject": "Pay equity audit 2026 - proposal",
     "text": "Dear Kaneka HR team,\n\nThank you for your interest in the pay equity audit 2026. The audit will be "
             "invoiced at full price. Invoices are payable within 60 days.\n\nKind regards,\nSofie Maes",
     "expected": "2 horizontal conflicts: price_model full_price vs discount_pct 10 (Jan Peeters, 14 Mar 2025, high) and "
                 "invoice_terms_days 60 vs 30 (addendum, high); each with sources and a suggested rewrite. No vertical."},
    {"id": "compose-b", "scenario": "Vertical: overtime premium missing -> solved at 4 other clients by 3+ people",
     "login": "sofie@example.com", "client_id": "cl-kaneka", "channel": "email",
     "subject": "Overtime premium on the September payslips",
     "text": "Dear Kaneka HR team,\n\nWe looked into your ticket: the overtime premium is missing on the September "
             "payslips of the night shift in the Oevel plant. We are checking the premium rules and will come back "
             "to you with a correction.\n\nKind regards,\nSofie Maes",
     "expected": "Vertical: similar resolved cases at Logistics, Healthcare, Industrial tools and Manufacturing clients "
                 "(anonymized for a consultant, figures masked); 3+ solvers such as Ruben Claes, An Wouters, Katrin Huber "
                 "and Piotr Zielinski as problem experts. Horizontal: nothing to contradict."},
    {"id": "compose-c", "scenario": "Both: full price + manual Excel pay gap calculation",
     "login": "sofie@example.com", "client_id": "cl-kaneka", "channel": "email",
     "subject": "Pay gap report - approach and price",
     "text": "Dear Kaneka HR team,\n\nFor the pay gap report we will calculate the adjusted and unadjusted pay gap "
             "manually in Excel, combining a payroll export with the job matrix. The report is invoiced at full "
             "price.\n\nKind regards,\nSofie Maes",
     "expected": "Horizontal conflict (full price vs 10% discount) with rewrite; vertical: pay gap report solved at "
                 "CityD-WES, Retail NL and Healthcare BE clients; approach warning: manual Excel vs one integrated system."},
    {"id": "compose-d", "scenario": "Clean draft: only confirmations",
     "login": "sofie@example.com", "client_id": "cl-kaneka", "channel": "email",
     "subject": "Confirmation of our agreements",
     "text": "Dear Kaneka HR team,\n\nAs agreed, the 10% discount on the pay equity audit stays in place. Invoices are "
             "payable within 30 days, and the payroll cut-off is on the 20th of each month. Our support response time "
             "is 24 hours, and Jan Peeters remains your contact person.\n\nKind regards,\nSofie Maes",
     "expected": "Horizontal: 5 confirmations (discount 10, invoice terms 30, cut-off 20th, SLA 24h, contact Jan "
                 "Peeters), no conflicts. Vertical: no similar cases (commercial confirmation)."},
    {"id": "compose-e", "scenario": "Declined modernization trap: proposing digital clocking to SK hi-tech",
     "login": "tomasz@example.com", "client_id": "cl-skhitech", "channel": "email",
     "subject": "Idea: digital time registration on the shopfloor",
     "text": "Dear HR team,\n\nFollowing our plant visit, we propose to modernise time registration on the shopfloor "
             "with a digital clocking system linked to InnovaHR, so shift leaders no longer type over paper time "
             "sheets. We could start a pilot on the separator line in November.\n\nKind regards,\nTomasz Nowak",
     "expected": "Horizontal conflict (high): the client decided on 17 Jun 2025 to keep paper time registration and asked "
                 "not to propose digital clocking before the 2027 budget (confirmed by 2 documents); suggested rewrite "
                 "that keeps paper time registration. Vertical: works council approval for time registration at other "
                 "clients."},
    {"id": "compose-f", "scenario": "Slack question: has anyone solved overtime premium missing on payslips?",
     "login": "lotte@example.com", "client_id": "cl-globalpaint", "channel": "chat", "subject": None,
     "text": "Has anyone solved overtime premium missing on payslips? Global Paint has it again in Germany.",
     "expected": "Vertical: 4 resolved cases (lead sees client names) with 3+ solvers and their top documents; "
                 "horizontal: nothing to check."},
]
