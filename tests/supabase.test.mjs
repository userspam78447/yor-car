import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {postgresSQL,postgresAdapter,createPostgresStorage,tables} from '../server/postgres.mjs';
import {mediaService,MAX_IMAGE_BYTES} from '../server/media.mjs';
import {migratePhotos} from '../server/migrate-photos.mjs';
import {dashboardAsync} from '../server/domain.mjs';
import {throttleAsync} from '../server/middleware.mjs';
import {testPostgres} from './postgres-helper.mjs';

test('PostgreSQL: parâmetros seguros, conexão única por transação, lock, rollback e liberação',async()=>{
 assert.equal(postgresSQL("SELECT '?' literal FROM users WHERE name=?"),"SELECT '?' literal FROM your_car.users WHERE name=$1");
 assert.equal(postgresSQL("SELECT 'FROM users' literal FROM users WHERE id=?"),"SELECT 'FROM users' literal FROM your_car.users WHERE id=$1");
 const calls=[],client={async query(sql){calls.push(sql);return {rows:[],rowCount:0}},release(){calls.push('release')}};
 const db=postgresAdapter({async connect(){return client},async query(){throw Error('Conexão fora da transação')},async end(){}});
 await assert.rejects(db.transaction(async()=>{await db.prepare('UPDATE vehicles SET status=? WHERE id=?').run('RESERVADO',1);throw Error('rollback esperado')}),/rollback esperado/);
 assert.deepEqual(calls,['BEGIN','SELECT pg_advisory_xact_lock(8675309,2026)','UPDATE your_car.vehicles SET status=$1 WHERE id=$2','ROLLBACK','release']);
 calls.length=0;await db.transaction(async()=>db.transaction(async()=>db.prepare('SELECT id FROM users').all()));assert.equal(calls.filter(c=>c==='BEGIN').length,1);assert.equal(calls.at(-2),'COMMIT');
 const previous=process.env.DATABASE_URL;delete process.env.DATABASE_URL;try{await assert.rejects(createPostgresStorage(),/DATABASE_URL/)}finally{if(previous!==undefined)process.env.DATABASE_URL=previous}
});

test('Migrations PostgreSQL: tabelas, sequences, constraints, RLS e grants privados',async()=>{
 const s=await testPostgres();try{
 const actual=await s.raw.query("SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='your_car'");assert.deepEqual(actual.rows.map(r=>r.tablename).sort(),tables.slice().sort());assert.ok(actual.rows.every(r=>r.rowsecurity));
 await s.raw.exec('SET ROLE anon');await assert.rejects(s.raw.query('SELECT * FROM your_car.users'),/permission denied/);await s.raw.exec('RESET ROLE');
 await s.raw.exec('SET ROLE authenticated');await assert.rejects(s.raw.query('SELECT * FROM your_car.vehicles'),/permission denied/);await s.raw.exec('RESET ROLE');
 await assert.rejects(s.db.prepare("INSERT INTO users(name,role,password_hash) VALUES('Inválido','ROOT','hash')").run(),/valid_role/);
 await assert.rejects(s.db.prepare("INSERT INTO orders(customer_id,vehicle_id,status) VALUES(999,999,'RESERVADO')").run(),/foreign key/);
 await s.db.prepare("INSERT INTO vehicles(id,brand,model,price,cost,status) VALUES(91,'Teste','Sequência',100,50,'DISPONIVEL')").run();await s.db.resetSequences();assert.equal((await s.db.prepare("INSERT INTO vehicles(brand,model,price,cost,status) VALUES('Teste','Novo ID',200,50,'DISPONIVEL')").run()).lastInsertRowid,92);
 }finally{await s.db.close()}
});

test('Storage migration: bucket público limitado e bloqueio de escrita mesmo com policy ampla prévia',async()=>{
 const s=await testPostgres();try{
 await s.raw.exec("CREATE SCHEMA storage;CREATE TABLE storage.buckets(id TEXT PRIMARY KEY,name TEXT,public BOOLEAN,file_size_limit BIGINT,allowed_mime_types TEXT[]);CREATE TABLE storage.objects(id INTEGER,bucket_id TEXT);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT USAGE ON SCHEMA storage TO anon,authenticated;GRANT ALL ON storage.objects TO anon,authenticated;CREATE POLICY unrelated_legacy_policy ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);");
 const file=(await readdir(new URL('../supabase/migrations/',import.meta.url))).find(f=>f.endsWith('_vehicle_images_storage.sql'));await s.raw.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 const bucket=(await s.raw.query('SELECT * FROM storage.buckets')).rows[0];assert.equal(bucket.public,true);assert.equal(Number(bucket.file_size_limit),MAX_IMAGE_BYTES);assert.deepEqual(bucket.allowed_mime_types,['image/jpeg','image/png','image/webp']);
 await s.raw.exec('SET ROLE authenticated');await assert.rejects(s.raw.query("INSERT INTO storage.objects VALUES(1,'vehicle-images')"),/row-level security/);await s.raw.exec('RESET ROLE');
 }finally{await s.db.close()}
});

test('Dashboard PostgreSQL mantém centavos, datas locais, gráficos e limites persistentes',async()=>{
 const s=await testPostgres();try{
 await s.db.prepare("INSERT INTO leads(name,phone,status,source,created_at) VALUES('Cliente','71999999999','NOVO','Site','2026-01-02T01:00:00Z')").run();await s.db.prepare("INSERT INTO expenses(description,category,amount,date) VALUES('Aluguel','Geral',25000,'2026-01-01')").run();
 const dash=await dashboardAsync(s.db,'2026-01-01','2026-01-01');assert.equal(dash.leads,1);assert.equal(dash.expenses,25000);assert.equal(dash.profit,-25000);assert.deepEqual(dash.charts.profit,[{label:'2026-01',value:-25000}]);assert.equal(typeof dash.costs,'number');
 await throttleAsync(s.db,'login-test',1,3600000);await assert.rejects(throttleAsync(s.db,'login-test',1,3600000),e=>e.status===429);
 }finally{await s.db.close()}
});

test('Fotos: MIME, extensão, tamanho, dono, confirmação e remoção recuperável',async()=>{
 const s=await testPostgres(),png=Buffer.from([137,80,78,71,13,10,26,10,0,0]);let valid=true,failDelete=false;const removed=[];
 const client={async sign(pathname){return {token:'scoped',signedUrl:'https://test.supabase.co/'+pathname}},async download(){return new Blob([valid?png:Buffer.from('invalid')],{type:'image/png'})},url(pathname){return 'https://test.supabase.co/'+pathname},async remove(pathname){if(failDelete)throw Error('erro temporário');removed.push(pathname)}};
 try{
 await s.db.prepare("INSERT INTO users(id,name,role,password_hash) VALUES(1,'Dono','ADMIN','hash')").run();const media=mediaService(s.db,client),user={id:1};
 for(const input of [{name:'file.exe',type:'image/png',size:10},{name:'file.png',type:'text/html',size:10},{name:'file.png',type:'image/png',size:MAX_IMAGE_BYTES+1}])await assert.rejects(media.token(user,input),e=>e.status===400);
 const auth=await media.token(user,{name:'foto.PNG',type:'image/png',size:png.length});assert.match(auth.pathname,/^vehicles\/[0-9a-f-]+\.png$/);
 await assert.rejects(media.confirm({id:999},auth.pathname),e=>e.status===404);valid=false;await assert.rejects(media.confirm(user,auth.pathname),e=>e.status===400);assert.equal((await s.db.prepare('SELECT state FROM media_uploads WHERE pathname=?').get(auth.pathname)).state,'FAILED');
 valid=true;const next=await media.token(user,{name:'foto.png',type:'image/png',size:png.length}),uploaded=await media.confirm(user,next.pathname);assert.equal((await media.confirm(user,next.pathname)).url,uploaded.url);
 failDelete=true;await media.cleanup(new Set([uploaded.url]));assert.equal((await s.db.prepare('SELECT state FROM media_uploads WHERE pathname=?').get(next.pathname)).state,'DELETING');await assert.rejects(media.validate({image:uploaded.url}),e=>e.status===409);
 failDelete=false;await media.cleanup(new Set([uploaded.url]));assert.equal((await s.db.prepare('SELECT state FROM media_uploads WHERE pathname=?').get(next.pathname)).state,'DELETED');
 }finally{await s.db.close()}
});

test('Migração de fotos preserva originais, reaproveita hash e relata arquivo ausente',async()=>{
 const s=await testPostgres(),dir=await mkdtemp(join(tmpdir(),'your-photos-')),png=Buffer.from([137,80,78,71,13,10,26,10,0,0]),objects=new Map();let uploads=0;
 const client={async download(pathname){if(!objects.has(pathname))throw Object.assign(Error('ausente'),{statusCode:'404'});return new Blob([objects.get(pathname)],{type:'image/png'})},async upload(pathname,bytes){objects.set(pathname,bytes);uploads++},url(pathname){return 'https://test.supabase.co/'+pathname}};
 try{
 await mkdir(join(dir,'uploads'));await writeFile(join(dir,'uploads','car.png'),png);
 await s.db.prepare("INSERT INTO vehicles(brand,model,price,cost,status,image,gallery) VALUES('Teste','Fotos',100,50,'DISPONIVEL','/uploads/car.png','/uploads/car.png\n/uploads/missing.png')").run();
 const first=await migratePhotos(s.db,client,dir);assert.equal(first.success.length,1);assert.equal(first.errors.length,1);assert.equal(uploads,1);assert.deepEqual(await readFile(join(dir,'uploads','car.png')),png);
 await s.db.prepare("UPDATE vehicles SET image='/uploads/car.png'").run();const second=await migratePhotos(s.db,client,dir);assert.equal(second.success[0].reused,true);assert.equal(uploads,1);
 }finally{await s.db.close();await rm(dir,{recursive:true,force:true})}
});
