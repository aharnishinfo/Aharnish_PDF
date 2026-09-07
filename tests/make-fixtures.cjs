// Minimal password-protected PDF, generated locally for the rejection/recovery test.
const {createHash} = require('node:crypto');
const {mkdirSync,writeFileSync} = require('node:fs');
const path = require('node:path');
const padding=Buffer.from('28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a','hex');
const pad=text=>Buffer.concat([Buffer.from(text),padding]).subarray(0,32);
const md5=bytes=>createHash('md5').update(bytes).digest();
function rc4(key,data) {
  const s=Array.from({length:256},(_,i)=>i);let j=0;
  for(let i=0;i<256;i++){j=(j+s[i]+key[i%key.length])%256;[s[i],s[j]]=[s[j],s[i]];}
  let i=0;j=0;
  return Buffer.from([...data].map(byte=>{i=(i+1)%256;j=(j+s[i])%256;[s[i],s[j]]=[s[j],s[i]];return byte^s[(s[i]+s[j])%256];}));
}
const id=md5(Buffer.from('Aharnish PDF regression fixture'));
const owner=rc4(md5(pad('owner')).subarray(0,5),pad('secret'));
const permissions=Buffer.alloc(4);permissions.writeInt32LE(-4);
const key=md5(Buffer.concat([pad('secret'),owner,permissions,id])).subarray(0,5);
const user=rc4(key,padding);
const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << >> >>',
  `<< /Filter /Standard /V 1 /R 2 /Length 40 /O <${owner.toString('hex')}> /U <${user.toString('hex')}> /P -4 >>`
];
let pdf='%PDF-1.4\n';const offsets=[0];
objects.forEach((body,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${body}\nendobj\n`;});
const start=Buffer.byteLength(pdf);
pdf+=`xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 5 /Root 1 0 R /Encrypt 4 0 R /ID [<${id.toString('hex')}><${id.toString('hex')}>] >>\nstartxref\n${start}\n%%EOF\n`;
mkdirSync(path.join(__dirname,'fixtures'),{recursive:true});
writeFileSync(path.join(__dirname,'fixtures','encrypted.pdf'),pdf);
