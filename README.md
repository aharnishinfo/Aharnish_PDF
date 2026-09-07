# Aharnish PDF

A static HTML, CSS, and JavaScript PDF toolkit. No backend, account, uploads, or build step.

## Run

Open this folder in VS Code, right-click `index.html`, and choose **Open with Live Server**. Use the local HTTP address, not a `file://` URL: PDF.js uses JavaScript modules and a worker. Any static HTTP server that serves `.mjs` as JavaScript also works. Use a current Chrome, Edge, or Firefox browser.

All libraries are included in `vendor/`, so processing works without internet after the site is served locally. No document data is sent anywhere.

## Publish

The project is ready for static hosting on GitHub Pages. See [DEPLOYMENT.md](DEPLOYMENT.md) for the upload steps, the current repository situation, and Google Search indexing. An upload-ready ZIP is generated with `node scripts/package.cjs`; extract it and upload its contents, not the ZIP file itself. Publication is not automatic and has not been performed.

## Tools

- Merge PDFs with file reordering; split into a selected PDF or individual PDFs in a ZIP.
- Remove pages; organize, reorder, or duplicate pages.
- JPG/PNG to PDF, with original-sized or A4 pages; EXIF phone-photo rotation and mirroring are respected.
- PDF to real PNG/JPG images, with page selection and resolution settings. Multiple images include a ZIP and individual downloads.
- Extract selectable PDF text (no OCR).
- Rotate, number, watermark, and crop selected pages.
- Add new Latin-script text or a fillable text field; flatten filled forms.
- Optimize PDF structure without image quality loss. If this does not reduce size, the original is returned with an explanation.

Blank page selection means all pages where indicated. Ranges are one-based, e.g. `1-3,5`. Page order is preserved; Organize also allows duplicate pages. Selected files can be moved or removed before processing.

## Limits

This is a browser toolkit, not full feature parity with iLovePDF. Office conversions, OCR, password removal, and editing existing text are not included. Added text uses Helvetica and supports its Latin character set. Positions are measured from the page's PDF crop-box origin before rotation. Cropping changes the visible page box; it is not redaction. Merge, split, remove, and organize automatically flatten form fields before copying pages to preserve visible filled values; those copied fields are no longer editable. Merging and copying do not preserve all document-level features such as bookmarks or signatures. Existing digital signatures are invalidated by PDF modifications.

Very large documents depend on available device memory. Image canvases are capped at 16 megapixels and 8192 pixels per edge. Compression optimizes structure, not images, so some PDFs cannot be made smaller. Keep original files.

## Libraries

- [pdf-lib 1.17.1](https://pdf-lib.js.org/) — MIT, PDF creation and editing.
- [PDF.js 4.10.38](https://mozilla.github.io/pdf.js/) — Apache-2.0, page rendering and text extraction.
- [JSZip 3.10.1](https://stuk.github.io/jszip/) — MIT, ZIP downloads.

Third-party licenses are retained in `vendor/`.

## Verification

`node --check app.js` checks syntax. `node tests/browser-test.cjs` runs browser integration tests using an installed Chrome. Set `CHROME_PATH` to another Chromium-based executable (such as Edge) to test that browser. The test runner is development-only; it uses Node's built-in modules and does not add a runtime framework or backend to the website.

The suite includes all 16 tools through their real form UI, generated page content and ordering, PNG/JPG signatures, real browser downloads, ZIP contents, form-value preservation, EXIF orientation, password rejection, corrupt-file recovery, numeric validation, upload ordering/drop/removal, repeated submissions, dialog lifecycle, filters, help, and mobile overflow. Test PDFs are generated locally, including an encrypted fixture with password `secret`. Screenshots are saved in `tests/`. See `tests/TEST-RESULTS.md` for the latest audit and limits.
