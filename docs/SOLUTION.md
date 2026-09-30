# TrustGrid

**Find it. Understand it. Trust it.**

One source of truth per client, checked against every client.

## The problem

SD Worx knows a lot about each client. That knowledge sits in emails, meeting notes, contracts, tickets
and in the heads of the people who did the work. A consultant who needs an answer can usually find
*something*. What they can't see is whether it is current, whether it applies to this client and country,
whether another document says the opposite, and who to ask when the documents run out.

So they double-check, ask around, or start from scratch. The information exists. The confidence doesn't.

## The idea

TrustGrid checks every piece of client knowledge along two dimensions.

| Dimension | Question it answers | What we check |
|---|---|---|
| **Horizontal**: the client record | Does this agree with everything else we know about *this* client? | Every new fact is compared with the record: same fact, or a contradicting one |
| **Vertical**: across clients | Has someone solved *this problem* before, somewhere else? | Every new problem and proposal is compared with how similar cases were resolved |

The result is a client record that doesn't contradict itself, holds no duplicates, stays in line with
proven approaches, and always names the people who can back it up.

## How it works

1. **Capture.** A consultant logs an email, meeting, visit or ticket. TrustGrid stores it as plain text,
   extracts facts from a fixed list (discount, headcount, go-live date, HR system, ...) and files it under
   the right dossier item. Text that tries to instruct the assistant is flagged and treated as data only.
2. **No duplicates, on three levels.**
   - *Documents*: a forwarded copy or near-identical note is linked to the original, not stored twice.
   - *Facts*: a fact that is already in the record gains a confirmation. "10% discount" confirmed by three
     documents is one fact with three sources, not three facts.
   - *Dossier items*: the same open question asked twice becomes one item.
   Every link is shown and explained. Anyone can override it, with a reason, and the override is logged.
3. **Horizontal check.** A new fact that contradicts the record ("full price" against an agreed 10% discount)
   becomes a visible conflict with a plain explanation: who said what, when, and in which document.
   Someone resolves it; nothing is silently overwritten.
4. **Vertical check.** A new problem is matched with resolved cases at other clients. If a proposal takes a
   different route than the proven one (a manual Excel calculation where an integrated system worked before),
   TrustGrid says so and names the person who solved it. Other clients appear only as sector and country,
   with figures masked, unless you work on that client.
5. **Backed answers.** Ask a question about a client. You get a short answer with inline sources [1], a trust
   score per source that you can unfold factor by factor, and a list of what remains uncertain: open
   conflicts, sources for another country, sources nobody owns, documents excluded as suspicious.
6. **The right people.** Every answer and every solution draft names two people:
   - the **record expert**, who knows this client best (most hours, most recent work), and
   - the **problem expert**, who solved the same kind of problem for other clients.
   Each comes with the reason they were chosen, their reliability and their best documents.

A solution draft follows the same route: it reuses the proven approach (attributed to the person who found it),
tailors it with the client's confirmed facts, and is checked against the record and against other clients
before anyone sends it.

## Why this matters for SD Worx

1. **Never contradictory within a record.** Conflicting facts surface the moment they are captured.
2. **Never duplicate information.** One fact, many confirmations. Duplicates strengthen the record instead of cluttering it.
3. **Never contradictory across records.** New work is checked against how similar clients were served.
4. **Always backed by the right people.** The record expert and the problem expert are one click away, with the reason why.

## The trust score

Every document and fact gets a score from 0 to 100. No black box: each factor is shown with its reason
("Updated 12 days ago", "No owner assigned", "Applies to NL, client is in BE").

| Factor | Weight | Full marks when |
|---|---|---|
| Recency | 20% | Updated in the last 90 days (zero after 3 years) |
| Author expertise | 20% | The author works in this domain and has a reliable track record |
| Ownership | 15% | A named person owns the document |
| Country relevance | 15% | It applies to the client's country |
| Corroboration | 15% | Three or more documents confirm it |
| No open conflicts | 15% | Nothing contradicts it right now |

**75 and above: Reliable. 50 to 74: Verify. Below 50: Uncertain.** A document flagged as suspicious never
scores above 40 and is never used as a source.

A person's reliability is earned the same way: how many of their facts were later confirmed, how few
conflicts were resolved against them, and how current their documents are.

## Fit with the challenge

| Area | How TrustGrid answers it |
|---|---|
| **Trust** | Explainable scores per source, uncertainties listed next to every answer |
| **Detect** | Conflicts within a record and across records, duplicates on three levels, suspicious text |
| **Capture** | Every touchpoint becomes structured facts in one client record |
| **Connect** | Record expert and problem expert behind every answer and every solution |

Security is part of the design: roles and client assignments are enforced on the server, other clients'
data is minimized, document text is never treated as instructions, and every view and change is logged.

## The shift

From *"I found something"* to *"I understand why I can rely on it"*, and I know who to call if I can't.

*All client facts, people and documents in the demo are fictional and marked as demo data.*
