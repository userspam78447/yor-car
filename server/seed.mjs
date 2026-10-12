import {demoCatalog,setDemoVehicle} from './demo-catalog.mjs';
import bcrypt from 'bcryptjs';
import {randomBytes} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {saleAsync,auditAsync} from './domain.mjs';
import {createStorage} from './storage.mjs';

export async function seedDemo(db,admin){
 return db.transaction(async()=>{
 if((await db.prepare('SELECT COUNT(*) n FROM vehicles').get()).n)throw new Error('A demonstração só pode ser criada com estoque vazio.');
 const insert=async(sql,...args)=>Number((await db.prepare(sql).run(...args)).lastInsertRowid);
 const models=[['Fiat','Mobi',85490],['Renault','Kwid',78990],['Hyundai','HB20',96900],['Chevrolet','Onix',101790],['Volkswagen','Polo',109900],['Fiat','Argo',93990],['Chevrolet','Onix Plus',112900],['Volkswagen','T-Cross',145900]];
 const names=['Marina Costa','Pedro Almeida','Ana Oliveira','Lucas Santos','Camila Rocha','Rafael Lima','Beatriz Dias','Bruno Souza','Carla Mendes','Diego Alves','Fernanda Silva','João Pereira'];
 const now=new Date(),day=(months,offset=0)=>{const d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-months,Math.max(1,Math.min(now.getUTCDate(),20)-offset),12));return d.toISOString().slice(0,10)};
 const sellers=[],customers=[],vehicles=[],leads=[];
 for(const [i,name] of ['Eduardo Costa','Isabela Martins','Gabriel Rocha'].entries())sellers.push(await insert('INSERT INTO users(name,email,role,password_hash,active) VALUES(?,?,?,?,1)',name,`vendedor${i+1}@yorcar.demo`,'VENDEDOR',await bcrypt.hash(randomBytes(24).toString('hex'),10)));
 for(const [i,name] of names.entries())customers.push(await insert('INSERT INTO customers(name,email,phone,notes) VALUES(?,?,?,?)',name,`cliente${i+1}@example.com`,`(71) 90000-${String(i+1).padStart(4,'0')}`,'Cadastro fictício de demonstração'));
 for(let i=0;i<24;i++){const [brand,model,price]=models[i%models.length];vehicles.push(await insert('INSERT INTO vehicles(brand,model,version,year,km,transmission,fuel,color,body,location,price,cost,status,description,features,offer) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',brand,model,i%2?'1.0 • Seminovo':'1.0 • Novo',2026-i%3,i%2?18000+i*500:0,i%3?'Manual':'Automático','Flex',['Prata','Branco','Preto'][i%3],model==='T-Cross'?'SUV':'Hatch','Salvador, BA',price*100,(price-12000-i*80)*100,'DISPONIVEL','Veículo e preço fictícios para demonstração. Cadastre fotos e informações reais antes de anunciar.','Ar-condicionado, Direção assistida, Conexão Bluetooth, Freios ABS',i%3===0?1:0))}
 for(const [i,entry] of demoCatalog.entries())await setDemoVehicle(db,vehicles[i+12],entry);
 for(let i=0;i<26;i++)leads.push(await insert('INSERT INTO leads(name,email,phone,vehicle_id,seller_id,source,status,message,created_at) VALUES(?,?,?,?,?,?,?,?,?)',names[i%12],`lead${i+1}@example.com`,`(71) 90001-${String(i).padStart(4,'0')}`,vehicles[i%24],sellers[i%3],['Site','WhatsApp','Instagram','Indicação'][i%4],i<12?'NEGOCIACAO':['NOVO','CONTATO','NEGOCIACAO','PERDIDO'][i%4],'Interesse fictício para demonstração',day(i%6)+'T12:00:00.000Z'));
 for(let i=0;i<6;i++)await insert('INSERT INTO expenses(description,amount,category,date) VALUES(?,?,?,?)','Despesa demonstrativa',(2200+i*190)*100,['Aluguel','Marketing','Operação'][i%3],day(i));
 for(let i=0;i<5;i++)await insert('INSERT INTO appointments(name,phone,email,vehicle_id,seller_id,date,time,status) VALUES(?,?,?,?,?,?,?,?)',names[i],`(71) 90000-000${i}`,`cliente${i+1}@example.com`,vehicles[12+i],sellers[i%3],new Date(Date.now()+(i+1)*86400000).toISOString().slice(0,10),`${10+i}:00`,i%2?'CONFIRMADO':'PENDENTE');
 await db.prepare("INSERT INTO settings(name,value) VALUES('mode','DEMO')").run();
 for(let i=0;i<12;i++){const v=await db.prepare('SELECT * FROM vehicles WHERE id=?').get(vehicles[i]);await saleAsync(db,admin,{vehicle_id:v.id,customer_id:customers[i],seller_id:sellers[i%3],lead_id:leads[i],amount:v.price/100,received:i%3===0?v.price/200:v.price/100,date:day(i%6),method:'PIX'})}
 for(let i=12;i<16;i++){await insert('INSERT INTO orders(customer_id,vehicle_id,seller_id,status,notes) VALUES(?,?,?,?,?)',customers[i%12],vehicles[i],sellers[i%3],i<14?'RESERVADO':'PENDENTE','Pedido demonstrativo');if(i<14)await db.prepare("UPDATE vehicles SET status='RESERVADO' WHERE id=?").run(vehicles[i])}
 await auditAsync(db,admin,'CRIAR_DEMONSTRACAO','settings',null,'Dados fictícios para desenvolvimento');
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.env.NODE_ENV==='production')throw new Error('Seed desabilitado em produção.');const root=dirname(dirname(fileURLToPath(import.meta.url))),{db}=await createStorage({path:join(root,'database','yor-car.sqlite')});try{const admin=await db.prepare("SELECT * FROM users WHERE role='ADMIN' LIMIT 1").get();if(!admin)throw new Error('Abra o site e crie o administrador primeiro.');await seedDemo(db,admin);console.log('Demonstração criada.')}finally{await db.close()}}
