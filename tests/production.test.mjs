import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {openDB,saleAsync} from '../server/domain.mjs';
import {createStorage} from '../server/storage.mjs';
import {createApp} from '../server/index.mjs';
import {testPostgres} from './postgres-helper.mjs';
import {importSQLite} from '../server/migrate-sqlite.mjs';

test('adaptador remoto mantém todas as consultas na conexão transacional e reverte venda inteira',async()=>{
 const storage=await testPostgres(),db=storage.db;
 try{
  await db.exec("INSERT INTO your_car.users(id,name,role,active,password_hash) VALUES(1,'Admin','ADMIN',1,'hash'); INSERT INTO your_car.customers(id,name,phone) VALUES(1,'Cliente','71999999999'); INSERT INTO your_car.vehicles(id,brand,model,status,price,cost) VALUES(1,'Teste','Atomicidade','DISPONIVEL',100000,70000); INSERT INTO your_car.leads(id,name,status,vehicle_id) VALUES(1,'Cliente','NEGOCIACAO',1); INSERT INTO your_car.orders(id,customer_id,vehicle_id,status) VALUES(1,1,1,'PENDENTE'); CREATE FUNCTION your_car.reject_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated notification failure'; END $$; CREATE TRIGGER reject_notification BEFORE INSERT ON your_car.notifications FOR EACH ROW EXECUTE FUNCTION your_car.reject_notification();");
  const input={vehicle_id:1,customer_id:1,seller_id:1,lead_id:1,order_id:1,amount:1000,received:500,date:'2026-10-08'};
  await assert.rejects(saleAsync(db,{id:1,role:'ADMIN'},input),/simulated/);
  for(const table of ['sales','payments','audit'])assert.equal(Number((await db.prepare(`SELECT COUNT(*) n FROM ${table}`).get()).n),0,table);
  assert.equal((await db.prepare('SELECT status FROM vehicles').get()).status,'DISPONIVEL');assert.equal((await db.prepare('SELECT status FROM orders').get()).status,'PENDENTE');assert.equal((await db.prepare('SELECT status FROM leads').get()).status,'NEGOCIACAO');
  await db.exec('DROP TRIGGER reject_notification ON your_car.notifications');await saleAsync(db,{id:1,role:'ADMIN'},input);
  assert.equal((await db.prepare('SELECT status FROM vehicles').get()).status,'VENDIDO');assert.equal(Number((await db.prepare('SELECT amount FROM payments').get()).amount),50000);
 }finally{await db.close()}

});

test('modo produção: setup protegido, concorrência, upload validado, foto compartilhada e exportação JSON',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'yor-production-')),storage=await testPostgres();
 const saved={AUTH_SECRET:process.env.AUTH_SECRET,SETUP_SECRET:process.env.SETUP_SECRET,SUPABASE_SECRET_KEY:process.env.SUPABASE_SECRET_KEY};
 process.env.AUTH_SECRET=randomBytes(40).toString('hex');process.env.SETUP_SECRET=randomBytes(40).toString('hex');process.env.SUPABASE_SECRET_KEY='test-double-only';
 const deleted=[],png=Buffer.from([137,80,78,71,13,10,26,10,0,0]);
 const mediaClient={async sign(pathname){return {token:'temporary-scoped-test-token',signedUrl:'https://test.supabase.co/storage/v1/object/upload/sign/vehicle-images/'+pathname}},async download(){return new Blob([png],{type:'image/png'})},url(pathname){return 'https://test.supabase.co/storage/v1/object/public/vehicle-images/'+pathname},async remove(pathname){deleted.push(mediaClient.url(pathname))}};
 const app=await createApp({production:true,authRoot:dir,storageInstance:{...storage,provider:'supabase'},mediaClient});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${app.server.address().port}`;let cookie='';
 const request=async(path,body,method=body?'POST':'GET')=>{const r=await fetch(base+'/api'+path,{method,headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});return {status:r.status,headers:r.headers,body:await r.json()}};
 try{
  const data={name:'Dono',email:'owner@example.com',password:'Testing-Password-2026'};
  assert.equal((await request('/session')).body.setupSecretRequired,true);
  assert.equal((await request('/setup',{...data,setup_secret:'wrong'})).status,403);
  const setup=await request('/setup',{...data,setup_secret:process.env.SETUP_SECRET});assert.equal(setup.status,201,JSON.stringify(setup.body));assert.match(setup.headers.get('set-cookie'),/HttpOnly.*SameSite=Strict.*Secure/);cookie=setup.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/setup',{...data,setup_secret:process.env.SETUP_SECRET})).status,403);assert.equal((await request('/session')).body.setup,false);
  const login=await request('/login',{email:data.email,password:data.password});assert.equal(login.status,200);assert.equal((await request('/login',{email:data.email,password:'incorrect'})).status,401);
  const staff=await request('/users',{name:'Vendedor',email:'staff@example.com',password:'Staff-Password-2026',role:'VENDEDOR',active:1});assert.equal(staff.status,201);const ownerCookie=cookie;cookie=(await request('/login',{email:'staff@example.com',password:'Staff-Password-2026'})).headers.get('set-cookie').split(';')[0];for(const path of ['/users','/audit','/settings'])assert.equal((await request(path)).status,403);assert.equal((await request('/upload-token',{type:'image/png',size:10,name:'test.png'})).status,403);cookie=ownerCookie;
  const token=await request('/upload-token',{type:'image/png',size:png.length,name:'test.png'});assert.equal(token.status,201);const uploaded=await request('/upload-confirm',{pathname:token.body.pathname});assert.equal(uploaded.status,200);
  const vehicle={brand:'Teste',model:'Concorrente',status:'DISPONIVEL',price:1000,cost:500,image:uploaded.body.url};
  const v1=(await request('/vehicles',vehicle)).body.id,v2=(await request('/vehicles',{...vehicle,model:'Foto compartilhada'})).body.id;
  await request('/vehicles/'+v1,{image:null},'PUT');assert.equal(deleted.length,0);
  await request('/vehicles/'+v2,{image:null},'PUT');assert.deepEqual(deleted,[uploaded.body.url]);
  assert.equal((await request('/vehicles/'+v1,{image:uploaded.body.url},'PUT')).status,409);
  const c1=(await request('/customers',{name:'Cliente 1',phone:'71999999991'})).body.id,c2=(await request('/customers',{name:'Cliente 2',phone:'71999999992'})).body.id;
  const reservations=await Promise.all([c1,c2].map(customer_id=>request('/orders',{customer_id,vehicle_id:v1,status:'RESERVADO'})));
  assert.equal(reservations.filter(r=>r.status===201).length,1);assert.equal(Number((await storage.db.prepare("SELECT COUNT(*) n FROM orders WHERE status='RESERVADO'").get()).n),1);
  const reserved=(await request('/orders')).body.find(o=>o.status==='RESERVADO'),customer_id=reserved.customer_id;assert.equal((await request('/orders/'+reserved.id,{status:'CANCELADO'},'PUT')).status,200);assert.equal((await storage.db.prepare('SELECT status FROM vehicles WHERE id=?').get(v1)).status,'DISPONIVEL');assert.equal((await request('/orders/'+reserved.id,{status:'RESERVADO'},'PUT')).status,200);
  assert.equal((await request('/expenses',{description:'Preparação',category:'Veículo',amount:50,date:new Date().toISOString().slice(0,10),vehicle_id:v1})).status,201);
  const sales=await Promise.all([1,2].map(()=>request('/sales',{vehicle_id:v1,customer_id,seller_id:setup.body.user.id,amount:1000,received:500})));
  assert.equal(sales.filter(r=>r.status===201).length,1);assert.equal(Number((await storage.db.prepare('SELECT COUNT(*) n FROM sales').get()).n),1);
  const sale_id=sales.find(r=>r.status===201).body.id;assert.equal((await storage.db.prepare('SELECT cost FROM sales WHERE id=?').get(sale_id)).cost,55000);const dash=await request('/dashboard');assert.equal(dash.status,200);assert.equal(dash.body.revenue,100000);assert.equal(dash.body.profit,45000);
  const publicInput={name:'Comprador público',phone:'71999998888',consent:true,vehicle_id:v2,intent:'RESERVA',request_id:'a702895f-735b-4ffa-b4d6-bd63bb24e65a'},savedCookie=cookie;cookie='';const publicOrder=await request('/purchase-request',publicInput);assert.equal(publicOrder.status,201);assert.equal((await request('/purchase-request',publicInput)).body.order_number,publicOrder.body.order_number);cookie=savedCookie;assert.ok((await request('/notifications')).body.some(n=>n.title==='Reserva solicitada'));const received=(await request('/orders')).body.find(o=>o.order_number===publicOrder.body.order_number);assert.equal((await request('/orders/'+received.id+'/progress',{previous:'RECEBIDO',stage:'CONFIRMADO'},'PUT')).status,200);
  const payments=await Promise.all([1,2].map(()=>request('/payments',{sale_id,amount:500})));assert.equal(payments.filter(r=>r.status===201).length,1);assert.equal(Number((await storage.db.prepare('SELECT SUM(amount) n FROM payments').get()).n),100000);
  const backup=await request('/backup');assert.equal(backup.body.format,'yor-car-export-v1');assert.equal(backup.body.tables.sales.length,1);assert.match(backup.headers.get('content-disposition'),/\.json/);assert.equal(existsSync(join(dir,'_admin')),false);
  for(const path of ['/','/carros','/carros/'+v2,'/ofertas','/financiamento','/venda-seu-carro','/contato','/sobre','/storage-upload.js'])assert.equal((await fetch(base+path)).status,200,path);
  cookie='';assert.equal((await request('/vehicles')).status,401);assert.equal((await request('/upload-token',{type:'image/png',size:10})).status,401);
 }finally{await new Promise(resolve=>app.server.close(resolve));await storage.db.close();for(const [key,value] of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;rmSync(dir,{recursive:true,force:true})}
});

test('migração preserva IDs, hashes, timestamps e rejeita destino preenchido sem modificar origem',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'yor-import-')),sourcePath=join(dir,'source.sqlite'),source=openDB(sourcePath);
 source.exec("INSERT INTO users(id,name,role,password_hash,created_at) VALUES(43,'Dono','ADMIN','existing-hash','2020-01-01T12:00:00Z'); INSERT INTO customers(id,name) VALUES(52,'Cliente'); INSERT INTO vehicles(id,brand,model,status,price,cost) VALUES(91,'Teste','Importado','VENDIDO',100000,70000); INSERT INTO sales(id,vehicle_id,customer_id,seller_id,amount,cost,profit,margin,date) VALUES(8,91,52,43,100000,70000,30000,30,'2020-01-01'); INSERT INTO payments(id,sale_id,amount,date,method) VALUES(7,8,100000,'2020-01-01','PIX');");source.close();
 const hash=()=>createHash('sha256').update(readFileSync(sourcePath)).digest('hex'),before=hash(),target=await testPostgres();
 try{const counts=await importSQLite(sourcePath,target.db);assert.equal(Number(counts.sales),1);assert.equal((await target.db.prepare('SELECT seller_id FROM sales WHERE id=8').get()).seller_id,43);assert.equal((await target.db.prepare('SELECT password_hash FROM users WHERE id=43').get()).password_hash,'existing-hash');assert.equal((await target.db.prepare('SELECT created_at FROM users WHERE id=43').get()).created_at,'2020-01-01T12:00:00Z');await assert.rejects(importSQLite(sourcePath,target.db),/Destino não está vazio/);assert.equal(hash(),before)}finally{await target.db.close();rmSync(dir,{recursive:true,force:true})}
});
