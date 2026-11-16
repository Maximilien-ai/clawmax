# Open issue triage — November 13

All **107 issues open at the audit start** received a primary type, area and
reported-impact priority, plus `triaged`. All existing labels were preserved.
This eliminates the snapshot's **48 unlabelled issues**; it does not establish
that each report still reproduces on current main or meets its closure criteria.

**#273 is closed with evidence**, leaving **106 open** at verification:
[automation-scope closure](https://github.com/Maximilien-ai/clawmax/issues/273#issuecomment-6848123006).
The v2 config passes the complete draft-07 schema, all four directories exist,
and Dependabot has produced 11 live update PRs. No automatic merge is enabled;
dependency update review remains separate from completing the automation issue.

Schema evidence: SchemaStore blob `124d6795da55c8c1b01084996f6f4c0cb945c328`,
validated with the existing Ajv against `.github/dependabot.yml`. Only the
editor annotation is registered; no validation constraints or formats are
disabled. Existing config source: `5873b3dd` (#291).

## Meaning and limits

- Priority is an initial queue assessment based on reported impact, not a new
  severity finding or a promise that all high-priority items fit RC98.
- `bug` records a defect report; current-source reproduction/verification is
  still required. Already-fixed or duplicate reports need linked evidence
  before closure. No bug is closed solely because it was labelled.
- `security` marks seven existing boundary/credential reports; it does not
  assert a new vulnerability or replace baseline alert dispositions. Dashboard
  owns evidence and disposition before RC98 promotion.
- `needs-decision` marks proposals requiring scope/architecture decisions.
  Future extension proposals are outside the current stability batch.
- Feedback provenance is unchanged: **54 currently open issues** retain
  `feedback`; **63 total confirmed linked issues** were labelled in the earlier
  audit. No new provenance is inferred from issue wording. Raw participant
  data stays private. Per-topic resolution and reporter replies remain open work.
- Initial classification is complete; current-source closure verification and
  the live all-feedback/topic audit remain engineering work, not owner acceptance.

## Classification at audit start

Type: bug **73**, chore **1**, documentation **6**, enhancement **25**, question **2**.

Priority: high **34**, low **13**, medium **60**.

The counts include the subsequently closed chore #273.

| Issue | Primary type | Area | Priority | Next evidence |
| --- | --- | --- | --- | --- |
| [#416](https://github.com/Maximilien-ai/clawmax/issues/416) | question | workflows | medium | Clarify report with synthetic evidence |
| [#415](https://github.com/Maximilien-ai/clawmax/issues/415) | enhancement | templates | low | Audit existing support; bound remaining scope |
| [#414](https://github.com/Maximilien-ai/clawmax/issues/414) | question | builder | medium | Clarify report with synthetic evidence |
| [#413](https://github.com/Maximilien-ai/clawmax/issues/413) | enhancement | builder | medium | Audit existing support; bound remaining scope |
| [#412](https://github.com/Maximilien-ai/clawmax/issues/412) | enhancement | agents | medium | Audit existing support; bound remaining scope |
| [#411](https://github.com/Maximilien-ai/clawmax/issues/411) | enhancement | platform | low | Audit existing support; bound remaining scope |
| [#410](https://github.com/Maximilien-ai/clawmax/issues/410) | enhancement | templates | low | Audit existing support; bound remaining scope |
| [#409](https://github.com/Maximilien-ai/clawmax/issues/409) | enhancement | agents | medium | Audit existing support; bound remaining scope |
| [#408](https://github.com/Maximilien-ai/clawmax/issues/408) | enhancement | integrations | low | Audit existing support; bound remaining scope |
| [#407](https://github.com/Maximilien-ai/clawmax/issues/407) | enhancement | platform | medium | Audit existing support; bound remaining scope |
| [#406](https://github.com/Maximilien-ai/clawmax/issues/406) | enhancement | integrations | low | Audit existing support; bound remaining scope |
| [#405](https://github.com/Maximilien-ai/clawmax/issues/405) | bug | agents | low | Verify current source and full reported scope |
| [#403](https://github.com/Maximilien-ai/clawmax/issues/403) | bug | builder | medium | Verify current source and full reported scope |
| [#402](https://github.com/Maximilien-ai/clawmax/issues/402) | bug | workspaces | high | Verify current source and full reported scope |
| [#401](https://github.com/Maximilien-ai/clawmax/issues/401) | enhancement | templates | medium | Audit existing support; bound remaining scope |
| [#400](https://github.com/Maximilien-ai/clawmax/issues/400) | enhancement | templates | medium | Audit existing support; bound remaining scope |
| [#399](https://github.com/Maximilien-ai/clawmax/issues/399) | enhancement | templates | medium | Audit existing support; bound remaining scope |
| [#398](https://github.com/Maximilien-ai/clawmax/issues/398) | enhancement | agents | medium | Audit existing support; bound remaining scope |
| [#397](https://github.com/Maximilien-ai/clawmax/issues/397) | documentation | integrations | medium | Verify documentation and release criteria |
| [#396](https://github.com/Maximilien-ai/clawmax/issues/396) | enhancement | workspaces | medium | Audit existing support; bound remaining scope |
| [#395](https://github.com/Maximilien-ai/clawmax/issues/395) | enhancement | workflows | medium | Audit existing support; bound remaining scope |
| [#394](https://github.com/Maximilien-ai/clawmax/issues/394) | bug | communications | high | Verify current source and full reported scope |
| [#393](https://github.com/Maximilien-ai/clawmax/issues/393) | bug | workflows | medium | Verify current source and full reported scope |
| [#392](https://github.com/Maximilien-ai/clawmax/issues/392) | bug | platform | medium | Verify current source and full reported scope |
| [#391](https://github.com/Maximilien-ai/clawmax/issues/391) | enhancement | workflows | low | Audit existing support; bound remaining scope |
| [#390](https://github.com/Maximilien-ai/clawmax/issues/390) | enhancement | communications | medium | Audit existing support; bound remaining scope |
| [#389](https://github.com/Maximilien-ai/clawmax/issues/389) | enhancement | builder | medium | Audit existing support; bound remaining scope |
| [#388](https://github.com/Maximilien-ai/clawmax/issues/388) | enhancement | workflows | medium | Audit existing support; bound remaining scope |
| [#387](https://github.com/Maximilien-ai/clawmax/issues/387) | enhancement | workflows | medium | Audit existing support; bound remaining scope |
| [#383](https://github.com/Maximilien-ai/clawmax/issues/383) | enhancement | agents | medium | Audit existing support; bound remaining scope |
| [#382](https://github.com/Maximilien-ai/clawmax/issues/382) | bug | communications | medium | Verify current source and full reported scope |
| [#381](https://github.com/Maximilien-ai/clawmax/issues/381) | enhancement | documents | medium | Audit existing support; bound remaining scope |
| [#380](https://github.com/Maximilien-ai/clawmax/issues/380) | enhancement | agents | medium | Audit existing support; bound remaining scope |
| [#379](https://github.com/Maximilien-ai/clawmax/issues/379) | bug | documents | medium | Verify current source and full reported scope |
| [#374](https://github.com/Maximilien-ai/clawmax/issues/374) | bug | workflows | high | Verify current source and full reported scope |
| [#373](https://github.com/Maximilien-ai/clawmax/issues/373) | bug | skills | medium | Verify current source and full reported scope |
| [#372](https://github.com/Maximilien-ai/clawmax/issues/372) | bug | builder | high | Verify current source and full reported scope |
| [#371](https://github.com/Maximilien-ai/clawmax/issues/371) | bug | agents | medium | Verify current source and full reported scope |
| [#370](https://github.com/Maximilien-ai/clawmax/issues/370) | bug | workflows | medium | Verify current source and full reported scope |
| [#369](https://github.com/Maximilien-ai/clawmax/issues/369) | bug | documents | medium | Verify current source and full reported scope |
| [#368](https://github.com/Maximilien-ai/clawmax/issues/368) | bug | documents | medium | Verify current source and full reported scope |
| [#366](https://github.com/Maximilien-ai/clawmax/issues/366) | bug | platform | medium | Verify current source and full reported scope |
| [#365](https://github.com/Maximilien-ai/clawmax/issues/365) | bug | documents | medium | Verify current source and full reported scope |
| [#364](https://github.com/Maximilien-ai/clawmax/issues/364) | bug | workspaces | high | Verify current source and full reported scope |
| [#363](https://github.com/Maximilien-ai/clawmax/issues/363) | bug | workspaces | medium | Verify current source and full reported scope |
| [#362](https://github.com/Maximilien-ai/clawmax/issues/362) | bug | metering | high | Verify current source and full reported scope |
| [#361](https://github.com/Maximilien-ai/clawmax/issues/361) | bug | metering | high | Verify current source and full reported scope |
| [#360](https://github.com/Maximilien-ai/clawmax/issues/360) | bug | platform | medium | Verify current source and full reported scope |
| [#359](https://github.com/Maximilien-ai/clawmax/issues/359) | bug | platform | medium | Verify current source and full reported scope |
| [#358](https://github.com/Maximilien-ai/clawmax/issues/358) | bug | workflows | medium | Verify current source and full reported scope |
| [#357](https://github.com/Maximilien-ai/clawmax/issues/357) | bug | workflows | medium | Verify current source and full reported scope |
| [#356](https://github.com/Maximilien-ai/clawmax/issues/356) | bug | platform | medium | Verify current source and full reported scope |
| [#354](https://github.com/Maximilien-ai/clawmax/issues/354) | bug | metering | medium | Verify current source and full reported scope |
| [#353](https://github.com/Maximilien-ai/clawmax/issues/353) | bug | documents | high | Verify current source and full reported scope |
| [#352](https://github.com/Maximilien-ai/clawmax/issues/352) | bug | documents | high | Verify current source and full reported scope |
| [#350](https://github.com/Maximilien-ai/clawmax/issues/350) | bug | workspaces | medium | Verify current source and full reported scope |
| [#348](https://github.com/Maximilien-ai/clawmax/issues/348) | bug | metering | high | Verify current source and full reported scope |
| [#338](https://github.com/Maximilien-ai/clawmax/issues/338) | bug | workflows | high | Verify current source and full reported scope |
| [#337](https://github.com/Maximilien-ai/clawmax/issues/337) | bug | models | high | Verify current source and full reported scope |
| [#336](https://github.com/Maximilien-ai/clawmax/issues/336) | bug | models | high | Verify current source and full reported scope |
| [#331](https://github.com/Maximilien-ai/clawmax/issues/331) | bug | models | medium | Verify current source and full reported scope |
| [#319](https://github.com/Maximilien-ai/clawmax/issues/319) | bug | agents | low | Verify current source and full reported scope |
| [#318](https://github.com/Maximilien-ai/clawmax/issues/318) | bug | workflows | low | Verify current source and full reported scope |
| [#317](https://github.com/Maximilien-ai/clawmax/issues/317) | bug | platform | low | Verify current source and full reported scope |
| [#316](https://github.com/Maximilien-ai/clawmax/issues/316) | documentation | workflows | low | Verify documentation and release criteria |
| [#315](https://github.com/Maximilien-ai/clawmax/issues/315) | bug | agents | medium | Verify current source and full reported scope |
| [#314](https://github.com/Maximilien-ai/clawmax/issues/314) | bug | workflows | medium | Verify current source and full reported scope |
| [#313](https://github.com/Maximilien-ai/clawmax/issues/313) | bug | agents | high | Verify current source and full reported scope |
| [#312](https://github.com/Maximilien-ai/clawmax/issues/312) | bug | agents | high | Verify current source and full reported scope |
| [#310](https://github.com/Maximilien-ai/clawmax/issues/310) | bug | agents | medium | Verify current source and full reported scope |
| [#308](https://github.com/Maximilien-ai/clawmax/issues/308) | bug | models | high | Verify current source and full reported scope |
| [#289](https://github.com/Maximilien-ai/clawmax/issues/289) | bug | models | medium | Verify current source and full reported scope |
| [#285](https://github.com/Maximilien-ai/clawmax/issues/285) | bug | platform | high | Verify current source and full reported scope |
| [#283](https://github.com/Maximilien-ai/clawmax/issues/283) | bug | workspaces | high | Verify current source and full reported scope |
| [#281](https://github.com/Maximilien-ai/clawmax/issues/281) | bug | platform | high | Verify current source and full reported scope |
| [#279](https://github.com/Maximilien-ai/clawmax/issues/279) | bug | agents | high | Verify current source and full reported scope |
| [#277](https://github.com/Maximilien-ai/clawmax/issues/277) | bug | workflows | high | Verify current source and full reported scope |
| [#275](https://github.com/Maximilien-ai/clawmax/issues/275) | bug | platform | high | Verify current source and full reported scope |
| [#273](https://github.com/Maximilien-ai/clawmax/issues/273) | chore | platform | medium | Closed: schema and live PR evidence |
| [#271](https://github.com/Maximilien-ai/clawmax/issues/271) | bug | platform | medium | Verify current source and full reported scope |
| [#265](https://github.com/Maximilien-ai/clawmax/issues/265) | bug | communications | medium | Verify current source and full reported scope |
| [#263](https://github.com/Maximilien-ai/clawmax/issues/263) | bug | templates | low | Verify current source and full reported scope |
| [#261](https://github.com/Maximilien-ai/clawmax/issues/261) | bug | builder | medium | Verify current source and full reported scope |
| [#259](https://github.com/Maximilien-ai/clawmax/issues/259) | bug | builder | medium | Verify current source and full reported scope |
| [#255](https://github.com/Maximilien-ai/clawmax/issues/255) | bug | workflows | medium | Verify current source and full reported scope |
| [#253](https://github.com/Maximilien-ai/clawmax/issues/253) | bug | metering | high | Verify current source and full reported scope |
| [#249](https://github.com/Maximilien-ai/clawmax/issues/249) | bug | workflows | high | Verify current source and full reported scope |
| [#247](https://github.com/Maximilien-ai/clawmax/issues/247) | bug | workflows | high | Verify current source and full reported scope |
| [#245](https://github.com/Maximilien-ai/clawmax/issues/245) | bug | agents | high | Verify current source and full reported scope |
| [#237](https://github.com/Maximilien-ai/clawmax/issues/237) | bug | platform | high | Verify current source and full reported scope |
| [#225](https://github.com/Maximilien-ai/clawmax/issues/225) | enhancement | communications | medium | Audit existing support; bound remaining scope |
| [#224](https://github.com/Maximilien-ai/clawmax/issues/224) | bug | platform | high | Verify current source and full reported scope |
| [#222](https://github.com/Maximilien-ai/clawmax/issues/222) | bug | communications | medium | Verify current source and full reported scope |
| [#220](https://github.com/Maximilien-ai/clawmax/issues/220) | bug | communications | medium | Verify current source and full reported scope |
| [#216](https://github.com/Maximilien-ai/clawmax/issues/216) | bug | communications | high | Verify current source and full reported scope |
| [#214](https://github.com/Maximilien-ai/clawmax/issues/214) | bug | communications | high | Verify current source and full reported scope |
| [#200](https://github.com/Maximilien-ai/clawmax/issues/200) | bug | builder | medium | Verify current source and full reported scope |
| [#197](https://github.com/Maximilien-ai/clawmax/issues/197) | bug | communications | medium | Verify current source and full reported scope |
| [#196](https://github.com/Maximilien-ai/clawmax/issues/196) | bug | communications | high | Verify current source and full reported scope |
| [#195](https://github.com/Maximilien-ai/clawmax/issues/195) | enhancement | platform | medium | Audit existing support; bound remaining scope |
| [#193](https://github.com/Maximilien-ai/clawmax/issues/193) | bug | platform | high | Verify current source and full reported scope |
| [#190](https://github.com/Maximilien-ai/clawmax/issues/190) | bug | integrations | medium | Verify current source and full reported scope |
| [#187](https://github.com/Maximilien-ai/clawmax/issues/187) | bug | platform | high | Verify current source and full reported scope |
| [#163](https://github.com/Maximilien-ai/clawmax/issues/163) | documentation | plugins | medium | Verify documentation and release criteria |
| [#162](https://github.com/Maximilien-ai/clawmax/issues/162) | documentation | platform | medium | Verify documentation and release criteria |
| [#160](https://github.com/Maximilien-ai/clawmax/issues/160) | documentation | plugins | high | Verify documentation and release criteria |
| [#111](https://github.com/Maximilien-ai/clawmax/issues/111) | documentation | platform | low | Verify documentation and release criteria |

Current dependency work and merge order: [#294 → #297 → #295](DEPENDABOT_2026-11-13.md).
No RC98 readiness, deployment or complete security audit is claimed.
