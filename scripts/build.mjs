import {copyFile,readFile,access} from 'node:fs/promises';
await copyFile('client/storage-upload.js','public/storage-upload.js');
for(const file of ['api/index.mjs','server/vercel-handler.mjs','public/index.html'])await access(file);
const frontend=await readFile('public/storage-upload.js','utf8');if(/SUPABASE_SECRET_KEY|DATABASE_URL|sbp_/.test(frontend))throw Error('Segredo inesperado no bundle.');
console.log('Your Car: arquivos públicos preparados, sem credenciais.');
