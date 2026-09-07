// Optional release packaging only. The website itself does not need Node or a build.
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('../vendor/jszip.min.js');
const root = path.resolve(__dirname, '..');
(async () => {
  const zip = new JSZip();
  const assets = ['index.html', 'style.css', 'app.js', '.nojekyll', ...fs.readdirSync(path.join(root, 'vendor')).map(name => `vendor/${name}`)];
  for (const name of assets) zip.file(name, fs.readFileSync(path.join(root, name)));
  const target = path.join(root, 'release');
  fs.mkdirSync(target, {recursive:true});
  const output = path.join(target, 'aharnish-pdf-site.zip');
  fs.writeFileSync(output, await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
  // Read back the archive and compare every release file with its source.
  const archive = await JSZip.loadAsync(fs.readFileSync(output));
  for (const name of assets) {
    if (!archive.file(name) || !(await archive.file(name).async('nodebuffer')).equals(fs.readFileSync(path.join(root,name)))) throw Error(`Release mismatch: ${name}`);
  }
  console.log(`Verified ${assets.length} release files: ${output}`);
})().catch(error => {console.error(error);process.exitCode=1;});
