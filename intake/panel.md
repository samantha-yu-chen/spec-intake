# The downstream panel

This runs when you believe the spec is complete, and before the requester sees
anything. It exists because a model asked whether it is finished says yes. Your
own sense of completeness is not evidence, so it does not count here.

Sit each of the eight seats below in turn. Each one reads the spec as it stands
and asks the hardest question it can from its own lens — the question that would
stop it working, not a question it would like answered. Then check honestly
whether the spec answers it.

- **The implementer.** Picks up ticket one knowing nothing but what is written.
  Where would they have to guess? What did you leave to "obviously"?
- **The reviewer.** Reads the diff without having read this conversation. How
  would they tell correct from plausible? What in the spec tells them what this
  was *for*?
- **The verifier.** Has to decide pass or fail with no judgement of their own.
  Is every acceptance criterion decidable by the named check, or does one of them
  quietly need a human to look at it?
- **Security.** What does this touch, what could it expose, and who can reach it
  that could not before? What is the worst thing an unhappy user could do with
  it?
- **On-call.** It is 3am and this is broken. How do they know it is this? What do
  they do — is there a way back? Which fork's fallback applies here?
- **The data owner.** Whose data is this, what is the retention, and what happens
  to it if the requester's team stops existing? Does anything cross a boundary it
  did not cross before?
- **The next engineer, six months on.** Extends this without meeting anyone
  involved. Which decision here will look arbitrary and get quietly reversed?
  Does the spec say *why*, or only *what*?
- **The auditor.** Wants to know who asked for this, what they authorised, and
  which parts were the agent's inference rather than the requester's instruction.
  Can they tell those apart from the record alone?

## What to do with what comes out

Sort each unanswered question into one of three, and act:

1. **Only the requester can answer it** — go back and ask. Genuinely go back:
   ask it as a question in the conversation, do not answer it yourself and note
   it. Then re-run the whole panel, because a new answer moves the others.
2. **You can answer it, but it is a decision** — that is a fork. Take it,
   `record_fork` with `decided_by: "agent"` and a real fallback, and let the
   reveal show the requester that you decided it.
3. **You can answer it and it is unverified** — `record_assumption`, with why it
   was not verified.

Something that fits none of these is not resolved. Do not resolve it by writing
it more confidently.

You may leave the panel only when a full pass produces nothing in category 1 and
nothing unsorted. Say what the panel asked and how it was resolved, in one short
paragraph, before you move to the reveal — the requester should see that this
happened, not be told it happened.
