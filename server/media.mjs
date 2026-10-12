import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {fail,auditAsync} from './domain.mjs';
export const MAX_IMAGE_BYTES=5*1024*1024,BUCKET='vehicle-images';
const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
export const imageLinks=row=>new Set([row?.image,...String(row?.gallery||'').split(/\r?\n/)].filter(Boolean));
export function validImage(bytes,type){return type==='image/jpeg'?bytes[0]===255&&bytes[1]===216:type==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):type==='image/webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'}
export function storageClient(){
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY)fail('Configure Supabase Storage no servidor.',503);
 const url=new URL(process.env.SUPABASE_URL);if(url.protocol!=='https:')fail('SUPABASE_URL deve usar HTTPS.',503);
 const client=createClient(url.href,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}),bucket=client.storage.from(BUCKET);
 const unwrap=({data,error})=>{if(error)throw Object.assign(new Error('Operação Storage falhou.'),{name:'StorageError',statusCode:error.statusCode});return data};
 return {async sign(pathname){return unwrap(await bucket.createSignedUploadUrl(pathname,{upsert:false}))},async download(pathname){return unwrap(await bucket.download(pathname))},async remove(pathname){return unwrap(await bucket.remove([pathname]))},async upload(pathname,bytes,type){return unwrap(await bucket.upload(pathname,bytes,{contentType:type,upsert:false}))},url(pathname){return bucket.getPublicUrl(pathname).data.publicUrl}};
}
export function mediaService(db,injected){
 let instance;const client=()=>injected||(instance??=storageClient());
 return {
 async token(user,input){
  const ext=extensions[input.type],name=String(input.name||'');
  if(!ext||!Number.isInteger(input.size)||input.size<=0||input.size>MAX_IMAGE_BYTES||!new RegExp(ext==='jpg'?'\\.(jpe?g)$':'\\.'+ext+'$','i').test(name))fail('Use JPG, PNG ou WebP de até 5 MB, com extensão correspondente.');
  const pathname=`vehicles/${randomUUID()}.${ext}`;
  await db.prepare("INSERT INTO media_uploads(pathname,user_id,state) VALUES(?,?,'PENDING')").run(pathname,user.id);
  try{const signed=await client().sign(pathname);return {pathname,token:signed.token,signedUrl:signed.signedUrl,supabaseUrl:process.env.SUPABASE_URL,bucket:BUCKET}}catch(error){await db.prepare("UPDATE media_uploads SET state='FAILED' WHERE pathname=?").run(pathname);throw error}
 },
 async confirm(user,pathname){
  const pending=await db.prepare('SELECT * FROM media_uploads WHERE pathname=? AND user_id=?').get(String(pathname),user.id);
  if(!pending)fail('Envio não encontrado.',404);if(pending.state==='ACTIVE')return {url:pending.url};if(pending.state!=='PENDING')fail('Envio indisponível.',409);
  const blob=await client().download(pending.pathname);if(blob.size>MAX_IMAGE_BYTES){await client().remove(pending.pathname);await db.prepare("UPDATE media_uploads SET state='FAILED' WHERE pathname=?").run(pending.pathname);fail('Limite de 5 MB por imagem.')}const type=blob.type,bytes=Buffer.from(await blob.arrayBuffer());
  if(bytes.length<=0||bytes.length>MAX_IMAGE_BYTES||!validImage(bytes,type)||pending.pathname.split('.').pop()!==extensions[type]){
   await client().remove(pending.pathname);await db.prepare("UPDATE media_uploads SET state='FAILED' WHERE pathname=?").run(pending.pathname);fail('Conteúdo de imagem inválido.');
  }
  const url=client().url(pending.pathname);
  await db.transaction(async()=>{await db.prepare("UPDATE media_uploads SET url=?,state='ACTIVE' WHERE pathname=? AND state='PENDING'").run(url,pathname);await auditAsync(db,user,'ENVIAR_FOTO','vehicles',null,pathname)});
  return {url};
 },
 async validate(row){for(const url of imageLinks(row)){const upload=await db.prepare('SELECT state FROM media_uploads WHERE url=?').get(url);const managed=process.env.SUPABASE_URL&&url.startsWith(process.env.SUPABASE_URL.replace(/\/$/,'')+'/storage/v1/object/public/'+BUCKET+'/');if((managed&&!upload)||(upload&&upload.state!=='ACTIVE'))fail('Uma foto foi removida ou ainda está sendo validada.',409)}},
 async cleanup(links){
  const unused=await db.transaction(async()=>{
   const used=new Set((await db.prepare('SELECT image,gallery FROM vehicles').all()).flatMap(row=>[...imageLinks(row)])),result=[];
   for(const url of links){if(used.has(url))continue;const upload=await db.prepare("SELECT pathname FROM media_uploads WHERE url=? AND state IN ('ACTIVE','DELETING')").get(url);if(upload){await db.prepare("UPDATE media_uploads SET state='DELETING' WHERE url=?").run(url);result.push({url,pathname:upload.pathname})}}
   return result;
  });
  for(const item of unused){try{await client().remove(item.pathname);await db.prepare("UPDATE media_uploads SET state='DELETED' WHERE url=?").run(item.url)}catch(error){console.error('Storage cleanup pending',{name:error.name})}}
 }
 };
}
