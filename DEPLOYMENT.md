# Publish Aharnish PDF on GitHub Pages

The application is a static HTML/CSS/JavaScript website. No production Node server, API key, database, npm installation, or paid conversion service is required. GitHub Pages serves it over HTTPS; the browser processes the documents.

## Recommended: a dedicated repository

This project uses its own repository: `https://github.com/aharnishinfo/Aharnish_PDF`, with `main` as its default branch. Run Git commands from inside the `Aharnish_PDF` folder. Its local repository is independent of the parent BMI checkout.

1. Create a public GitHub repository named `Aharnish_PDF` (or another name you prefer).
2. Extract `release/aharnish-pdf-site.zip` locally. Upload its **contents**, including the entire `vendor/` folder and `.nojekyll`, into the new repository root. Uploading the ZIP itself does not deploy a website.
3. Confirm `index.html`, `style.css`, `app.js`, `.nojekyll`, and `vendor/` are at the repository root. Keep filenames and letter case unchanged.
4. Commit those files to the repository's default branch.
5. Open **Settings → Pages → Build and deployment**. Choose **Deploy from a branch**, select the branch containing these files (usually `main` in a new repository), choose **/(root)**, and save.
6. Wait for GitHub's Pages deployment to succeed and open the URL shown in Settings. If the owner is `aharnishinfo` and the repository is `Aharnish_PDF`, the expected URL is `https://aharnishinfo.github.io/Aharnish_PDF/`. This is an expected address, not a verified live deployment.

The `.nojekyll` marker keeps the release as plain static files. All runtime assets use relative URLs, including the PDF.js module and worker, so repository-name subpaths work.

If you instead publish from the existing BMI repository root, the PDF app would be at `https://aharnishinfo.github.io/BMI/Aharnish_PDF/`, provided Pages is enabled for that branch and this folder is committed. GitHub's branch-based Pages settings select only the repository root or `/docs`; they cannot select arbitrary `Aharnish_PDF/` as the publication root. A dedicated repository avoids changing the existing site's root.

## Test after publication

Local tests passed under `/Aharnish_PDF/` with case-sensitive asset-path checks. The hosted site still needs a live smoke check after GitHub publishes it:

- Confirm the home page loads all 16 tool cards.
- Convert a two-page PDF to PNG and JPG and open the downloaded images/ZIP.
- Merge two PDFs, split the result, and open the downloaded PDF.
- Check Developer Tools for failed script/module/worker requests. Keep the `vendor` folder and its exact filenames if you update the site.

An incorrect publishing folder usually produces a 404 page. Missing CSS affects the layout; missing JavaScript or vendor files prevents tools or conversions from running. These are deployment-path problems, not damage to the original project or documents.

## Google Search

Hosting and search indexing are separate. Once the public HTTPS site is live, add its URL-prefix property in Google Search Console, verify ownership using Google's provided HTML file or meta tag, then inspect the homepage URL and request indexing. Do not add a made-up verification token. Google does not guarantee immediate indexing or inclusion.

## Rebuild and verify the release

From this folder, run `node scripts/package.cjs`. The ZIP includes only runtime files and bundled library licenses. Tests, fixture PDFs, screenshots, and development scripts are excluded. The packager reads the archive back and checks every file against the source. This is an optional packaging utility, not a website runtime requirement.

Run `node tests/browser-test.cjs` to execute the functionality and deployment-path suite using locally installed Chrome.

Official references:

- [GitHub Pages publishing-source configuration](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Google: request crawling/indexing](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)
