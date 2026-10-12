import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,dirname,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createStorage} from './storage.mjs';
import {validImage,storageClient,MAX_IMAGE_BYTES} from './media.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url))),types={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
export async function migratePhotos(db,client,publicRoot=join(root,'public')){
 const mapping=new Map(),report={success:[],errors:[]};
 const vehicles=await db.prepare('SELECT id,image,gallery FROM vehicles').all();
 for(const path of new Set(vehicles.flatMap(row=>[row.image,...String(row.gallery||'').split(/\r?\n/)]))){
  if(!/^\/uploads\/[\w.-]+$/.test(path||''))continue;
  try{
   const bytes=await readFile(join(publicRoot,path.slice(1))),extension=extname(path).toLowerCase(),type=types[extension];
   if(!type||!bytes.length||bytes.length>MAX_IMAGE_BYTES||!validImage(bytes,type))throw Error('Imagem local incompatível.');
   const hash=createHash('sha256').update(bytes).digest('hex'),pathname=`migrated/${hash}${extension==='.jpeg'?'.jpg':extension}`;
   let exists=false;try{const remote=await client.download(pathname),remoteHash=createHash('sha256').update(Buffer.from(await remote.arrayBuffer())).digest('hex');if(remoteHash!==hash)throw Error('Conteúdo remoto divergente.');exists=true}catch(error){if(!['404','400'].includes(String(error.statusCode)))throw error}
   if(!exists)await client.upload(pathname,bytes,type);
   mapping.set(path,{pathname,url:client.url(pathname)});report.success.push({file:path,pathname,reused:exists});
  }catch(error){report.errors.push({file:path,error:error.name})}
 }
 // All database changes commit together; failed local files keep their original links.
 await db.transaction(async()=>{
  for(const upload of mapping.values())await db.prepare("INSERT INTO media_uploads(pathname,url,state) VALUES(?,?,'ACTIVE') ON CONFLICT(pathname) DO UPDATE SET url=excluded.url,state='ACTIVE'").run(upload.pathname,upload.url);
  for(const row of await db.prepare('SELECT id,image,gallery FROM vehicles').all()){
   const image=mapping.get(row.image)?.url||row.image,gallery=String(row.gallery||'').split(/\r?\n/).map(path=>mapping.get(path)?.url||path).join('\n');
   if(image!==row.image||gallery!==(row.gallery||''))await db.prepare('UPDATE vehicles SET image=?,gallery=? WHERE id=?').run(image,gallery,row.id);
  }
 });return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let storage;try{storage=await createStorage({production:true});const report=await migratePhotos(storage.db,storageClient());await writeFile('photos-migration-report.json',JSON.stringify(report,null,2));console.log(`${report.success.length} foto(s) migrada(s); ${report.errors.length} erro(s). Veja photos-migration-report.json. Originais preservados.`);if(report.errors.length)process.exitCode=1}catch(error){console.error('Migração de fotos interrompida:',error.name);process.exitCode=1}finally{await storage?.db.close()}
}
