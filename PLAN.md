# Winning Submission Plan — Ledger Agent Stack Bounty (BNT-0038)

**Deadline:** Fri 2026-06-12, 23:59 CET (~7 days from 2026-06-05)
**Prize structure:** $100 to first 50 valid submissions · 5 Ledger Flex raffled · **best content reshared by Ledger** (the real prize)
**Lane:** C (Build Something Real), delivered as content.

---

## 0. North Star

This is a **content + proof-of-use competition**, not a code rubric. Judged "on merit," no rubric → the **video and post matter more than the code**. Every decision optimizes for one outcome: *content Ledger wants to reshare.*

The single sentence we are dramatizing (Ledger's own thesis):
> "The missing layer in every agentic crypto stack is deterministic, hardware-enforced guardrails."

The closing copy (our CTA, basically pre-written):
> AI can reason. AI can act. AI can be manipulated. **Ledger keeps humans in control.**

---

## 1. The Project

**Name:** Guardian — *Hardware-in-the-Loop Treasury Agent*
**Post headline:** "When Your Agent Has No Kill Switch" (borrows Ledger's Lane B language)

A thin autonomous treasury agent (TypeScript) that assembles and broadcasts transactions on **Ethereum Sepolia**, where **every value-moving action is physically gated by a Ledger device (Speculos emulator)**. A software **policy layer** (whitelist + amount cap + simulation) is the first brake; the **device screen** is the final, un-bypassable brake.

**What makes it Lane C (not Lane A):** the original policy layer + the staged attack scenarios. "I ran the CLI and signed" is Lane A and crowded; "the agent got tricked and the hardware saved the funds" is a story.

---

## 2. Scope discipline (what we will and won't build)

| Decision | Choice | Why |
|---|---|---|
| Device | **Speculos emulator** | No hardware needed; explicitly valid proof-of-use |
| Language | **TypeScript/Node** | DMK is TS; CLIs are Node; least glue |
| Chain | **Ethereum Sepolia** | Best tooling support, easy faucet, broad recognition |
| Components | **Wallet CLI + DMK** (complementary, ~free "across the stack") | Depth + clarity beats breadth |
| Multisig CLI | **Stretch goal only** (day 5+ if everything locked) | Multisig+Speculos = scope bomb; brief says "cover what fits" |
| Frontend | **None** (terminal + emulator are the stars) | A UI competes with the device screen; dilutes Ledger's product |

**Anti-goal:** going wide across all 4 primitives. That is the most common way good builders lose a narrative-judged bounty.

---

## 3. Architecture (deliberately thin)

```
LLM agent (assembles intent, ~100-150 lines)
      │
      ▼
Policy guardrail layer   ← whitelist + amount cap + tx simulation (our original code, ~80 lines)
      │
      ▼
Signing (Wallet CLI and/or DMK) ──► Speculos device screen (human/policy approve|reject)
      │
      ▼
Broadcast → Ethereum Sepolia
```

The signing call is either a shelled Wallet CLI command or a DMK call — **decided by the spike in Phase 1.**

---

## 4. The demo = the script (three escalating scenes)

This IS the storyboard for the 60–90s captioned screen-recording.

**Scene 1 — Legit (Speed).**
Agent receives a real instruction ("rebalance: send 0.2 ETH to cold wallet"). Assembles tx → Speculos shows exact destination + amount → approve → broadcast. ✅ *The agent works, fast.*

**Scene 2 — Prompt injection (Manipulation).**
Agent ingests a poisoned input (fake "support" message in its task queue) → LLM *obeys* and assembles a draining tx to an attacker address. Software-only, this sends. **Brake fires:** policy layer flags (not whitelisted / over cap) AND/OR the device screen exposes the real attacker address → REJECT. ❌

**Scene 3 — Address poisoning (Honest mistake).**
Attacker has seeded a lookalike address into tx history; the agent isn't "hacked," it just picks the wrong one. The device screen shows the true destination → human catches it → REJECT. ❌

**Punchline card:** the closing copy from §0.

Every scene funnels to the same frame: *Agent proposes → Ledger displays exact tx → Human verifies → Approve/Reject.* That repetition is the message.

---

## 5. Deliverables (one build → three content cuts)

1. **GitHub repo** (public): clean README (setup, architecture diagram, the 3 scenarios), the policy layer code, a short "what I'd improve" honesty section, embedded GIF. Include mandatory links: `developers.ledger.com/docs/ai-tools/overview` and `github.com/LedgerHQ/agent-skills`.
2. **Video** (60–90s): the 3-scene arc, captioned, Speculos screen front and center. **The actual prize-winning artifact.**
3. **Public post** (X or LinkedIn): builder-voice thread/post with the video/GIFs.

### Validity checklist (must ALL be true to qualify)
- [ ] Genuinely used DMK or Wallet CLI, with visible proof (command + signing flow on Speculos screen + public repo)
- [ ] Public post on X or LinkedIn
- [ ] Post tags **@Ledger**
- [ ] Post has visible **#Sponsored** or **#LedgerSponsor** (not buried — legal req)
- [ ] Both mandatory doc/repo links included
- [ ] Google Form submitted (linked on bounty page)
- [ ] No security/financial overclaims; testnet only, no real funds
- [ ] 18+, not in excluded territory
- [ ] Post **early** to land in first-50 for guaranteed $100

---

## 6. 7-Day timeline

| Day | Goal | Output |
|---|---|---|
| **1** | **SPIKE (the gate):** land ANY signature on Speculos. Learn path: Wallet CLI→Speculos or DMK→device-sdk-ts→Speculos. Install skills, Speculos, Node project, Sepolia faucet. | A signed Sepolia testnet tx visible on the emulator screen |
| **2** | Build the happy path (Scene 1): agent assembles → signs → broadcasts | Scene 1 working end-to-end |
| **3** | Policy layer (whitelist, amount cap, simulation) + Scene 2 (prompt injection) | Scenes 1–2 working |
| **4** | Scene 3 (address poisoning) + harden, clean logs for on-camera readability | All 3 scenes working |
| **5** | Record + edit video (captions). Write README + architecture diagram. (Optional: multisig stretch only if ahead) | Video draft + repo |
| **6** | Write post (hook + thread + disclosure + tags + links). **Post publicly. Submit Google Form.** | Submitted, valid |
| **7** | Buffer / engage with Ledger replies / polish | — |

**Hard rule:** if Day 1 spike fails, we stop and re-architect before building anything else. Nothing downstream is worth doing until a signature lands on Speculos.

---

## 7. Risks & mitigations

- **Wallet CLI may be USB-only (not Speculos-capable).** → Day-1 spike resolves; fallback is DMK→device-sdk-ts→Speculos transport (TCP 127.0.0.1:9999 / `@ledgerhq/hw-transport-node-speculos`). Either path is valid proof.
- **Over-building / scope creep.** → Multisig and frontend are stretch-only. Video > code.
- **Wrong/guessed commands in a public @Ledger post.** → Only ship commands verified hands-on against live docs.
- **Missing first-50 window.** → Post on Day 6, not Day 7.
- **Overclaiming security.** → Frame device as final root of trust; policy layer as defense-in-depth; state the limitation (policy lives in software) honestly.

---

## 8. Verified stack reference

- Skills (DMK): `npx skills add ledgerhq/agent-skills -s ledger-dmk-implementation dmk-intent-vocabulary dmk-business-logic`
- Skills (Wallet CLI): `npx skills add -g LedgerHQ/developer-ai-skills -s wallet-cli-usage`
- Wallet CLI verbs: `discover`, `receive`, `balances`, `operations`, `send` (`--dry-run`), `swap`, `staking`, `genuine-check`
- DMK: TS SDK — device sessions, signing, Clear Signing, EIP-1193
- Speculos: `pip install speculos`; web UI `127.0.0.1:5000`; APDU TCP `127.0.0.1:9999`; node transport `@ledgerhq/hw-transport-node-speculos`
