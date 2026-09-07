# Aharnish PDF audit

Result: PASS in local headless Chrome on Windows, served over local HTTP.

Deployment-readiness rerun: PASS with the complete suite hosted beneath `/Aharnish_PDF/`, matching a GitHub Pages project URL. The test server enforces filename case. No missing JavaScript/module/CSS assets, uncaught page errors, or external HTTP requests were recorded. Actual PNG and ZIP downloads passed their on-disk signature checks. The release ZIP was read back and all 11 runtime/license files matched the source. GitHub publication and the eventual live HTTPS URL have not yet been tested.

## Fixes verified

- Delayed dialog-close events no longer erase files selected in a newly opened tool.
- JPEG EXIF orientation is applied when converting phone photos to PDF.
- Merge, split, remove, and organize flatten form fields before copying pages, preserving filled values as page content. The tool dialog explains that copied fields become non-editable.
- Fields that cannot fit readably on small pages are rejected with a useful message.
- Processing validates numeric bounds, allowed settings, missing/empty files, and supported tool IDs independently of HTML input validation.
- Page-selection limits are checked before expanding ranges.

## Tool coverage

All 16 tools passed their actual upload, settings, submit, result-link, and downloadable-blob flow: merge, split, remove, organize, images to PDF, PDF to JPG, PDF to PNG, PDF to text, rotate, numbers, watermark, crop, edit, forms, flatten, and compress.

Output checks include real PNG/JPEG signatures and dimensions; ZIP entries; page counts and extracted page content/order; selected-page edits, watermarks, and numbers; crop offsets and zero margins; rotation; A4 image pages; form values before/after flattening and page copying; and compression never increasing output size. Chrome also saved PNG and ZIP files to disk, where their signatures were checked.

The extended audit contains 24 scenarios, including password-protected PDF rejection/retry, phone-photo orientation, invalid ranges/settings, corrupt files, scanned PDFs without selectable text, duplicate field names, overflowing/unsupported text, single-file merge, flattening a PDF without forms, tiny pages, rapid close/reopen, every tool's UI flow, file reordering/removal/drop, help, navigation, filters, search, error recovery, duplicate submissions, busy-state close prevention, stale-result clearing, and object-URL cleanup.

Desktop screenshot inspected. Mobile page and form dialog at 390px passed horizontal-overflow checks. JavaScript syntax checks passed.

## Reproduce

From the project folder:

```text
node --check app.js
node tests/browser-test.cjs
```

The suite generates its PDF fixtures locally. No uploaded user documents or external services are used.

## Practical limits

These checks verify the included functionality with generated fixtures, not every PDF ever produced or every browser/device. Very large or unusual PDFs can still encounter browser-memory or PDF-library limits. Firefox and physical mobile devices were not tested.

Office conversion, OCR, password removal, and replacement of existing PDF text remain outside the included feature set. Added text is limited to the bundled Helvetica character set. Compression may report no savings. Open the application through Live Server/local HTTP for image and text conversion.
