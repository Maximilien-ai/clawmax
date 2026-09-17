# RC80 document PDF work — September 17, 2026

## Boundary

Source implementation only; RC80 has not been tagged, built, or deployed.
MBP14 and test10 remain pinned to RC79 for the demo. No instance restart,
configuration change, or rollout was performed for this work.

## Changes

- `2d5a7231`: pinned browser PDF dependencies (`pdfmake` 0.3.11, `marked` 18.0.13).
- `77ab3ff7`: Docs Preview / Markdown / PDF views and Markdown / PDF download menu.
- `fbcc17f8`: rendering, safe-image, artifact lifecycle, and presentation tests;
  connected to `SYSTEM/test.sh`.
- PDF generation is user-triggered and browser-local. Fonts and renderer load
  lazily. Preview and download reuse the generated blob for the selected saved
  document. Switching documents disposes it and suppresses stale completion.
- Failed generation can be retried; original Markdown remains downloadable.
  While editing, the existing toolbar explicitly downloads **saved** Markdown.
- Headings, emphasis, links, lists, task markers, tables with repeated headers,
  code blocks, quotations, pagination, and page numbers are supported.

## Limits

- This is a Markdown-to-PDF rendering, not an exact screenshot of the HTML view.
  Raw HTML is omitted; code is plain text, without syntax highlighting.
- Standalone embedded or workspace-relative PNG/JPEG images are supported, up
  to 20 images, roughly 5 MB each. External URLs are never fetched by the PDF
  renderer. Unsupported/unavailable images produce visible warnings and alt
  descriptions; mixed inline images use descriptions.
- Documents above two million characters are rejected for PDF generation;
  Markdown download remains available. Bundled Roboto does not cover every
  writing system or emoji. Broader font coverage is not claimed.
- Native PDF viewers differ between browsers. Fit-to-width is requested, and
  a download fallback is always available after generation.

## Engineering evidence

- Focused `markdownPdf.test.ts` and `MarkdownDocumentViewer.test.tsx`: passed.
  Includes valid PDF bytes, source/frontmatter handling, tables/lists/links,
  no external image requests, empty/oversize content, concurrent request
  coalescing, blob reuse/revocation, retry, and stale-result suppression.
- Existing DocHub selection and asset-presentation tests: passed.
- Server TypeScript and lint: passed. Full client TypeScript still has its
  pre-existing baseline failures; no diagnostics in changed files.
- `npm run build`: passed. PDF renderer, fonts, and Markdown converter emitted
  as separate lazy chunks. Existing bundle-size/Browserslist warnings remain.
- Isolated source-browser checks, synthetic read-only intercepted Docs content:
  desktop 1440×1000 and mobile 390×844; long path wrapping; PDF preview;
  Markdown and PDF menu downloads; generation error and retry controls.
- Browser-generated PDF: five A4 pages, 32,367 bytes, selectable text verified
  with `pdftotext`, including final Section 35. Embedded PNG generation also
  smoke-tested. Desktop and mobile PDF screenshots visually inspected.
- Local synthetic evidence: `/tmp/clawmax-rc80-acceptance.pdf`,
  `/tmp/clawmax-rc80-menu.pdf`, `/tmp/clawmax-rc80-original.md`, and
  `/tmp/clawmax-rc80-pdf-{desktop,mobile-final,error-mobile}.png`.
- [Feature/test CI](https://github.com/Maximilien-ai/clawmax/actions/runs/35283553857)
  was in progress at recording; this is not a completed RC acceptance claim.

## Dependency audit and remaining gates

`npm audit --json` exited 1: 593 dependency entries (336 production, 258 dev,
32 optional; categories overlap); 0 critical, 0 high, 3 moderate findings in
the existing `express` / `body-parser` / `qs` chain. Installation reported 565
audited packages and 23 additions. No findings were attributed to the two new
direct PDF dependencies. This is a dependency audit, not a complete security audit.

Owner: Dashboard engineering. Deadline: resolve or explicitly disposition the
moderate findings before RC80 image approval. Do not alter the pinned demo
images for this remediation.

Before RC80: finish CI, full integration/validation/coverage, exact candidate
version alignment, public and combined architecture builds and smoke tests,
and cloud/on-prem acceptance. No reviewer checklist or rollout authorization
is implied by this document.
