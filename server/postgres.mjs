import pg from 'pg';
import {AsyncLocalStorage} from 'node:async_hooks';
export const tables=['users','vehicles','customers','leads','orders','expenses','appointments','settings','notifications','sales','payments','audit','public_requests','media_uploads','order_tracking','rate_limits'];
const identities=new Set(tables.filter(t=>!['public_requests','media_uploads','order_tracking','rate_limits'].includes(t)));
const number=value=>{const n=Number(value);if(!Number.isFinite(n)||Math.abs(n)>Number.MAX_SAFE_INTEGER)throw Error('Valor PostgreSQL fora do limite seguro.');return n};
pg.types.setTypeParser(20,number);pg.types.setTypeParser(1700,number);
// SQL remains shared with local SQLite. Only these documented expressions differ.
export function postgresSQL(text){
 text=text.replace(/SUM\(status='([^']+)'\)/g,"SUM(CASE WHEN status='$1' THEN 1 ELSE 0 END)")
 .replace(/date\(created_at,\?\)/g,'((created_at::timestamptz + ?::interval)::date)::text');
 if(/INSERT INTO rate_limits/i.test(text))text=text.replace(/WHEN window_start/g,'WHEN rate_limits.window_start').replace(/ELSE count\+1/g,'ELSE rate_limits.count+1').replace(/ELSE window_start END/g,'ELSE rate_limits.window_start END');
 let index=0;
 return text.split(/('(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*)/g).map(part=>/^(?:'|"|--)/.test(part)?part:part.replace(/\?/g,()=>'$'+(++index)).replace(/\b(FROM|JOIN|UPDATE|INTO)\s+([a-z_]+)\b/gi,(all,keyword,table)=>tables.includes(table)?`${keyword} your_car.${table}`:all)).join('');
}
export function postgresAdapter(pool){
 const scope=new AsyncLocalStorage(),query=async(text,args=[])=>{const client=scope.getStore()||pool,result=await client.query(postgresSQL(text),args);for(const field of result.fields||[])if([20,1700].includes(field.dataTypeID))for(const row of result.rows)if(row[field.name]!==null)row[field.name]=number(row[field.name]);return result};
 const db={provider:'supabase',prepare(text){return {
 async get(...args){return (await query(text,args)).rows[0]},async all(...args){return (await query(text,args)).rows},
 async run(...args){const table=/^\s*INSERT\s+INTO\s+([a-z_]+)/i.exec(text)?.[1];const sql=identities.has(table)&&!/\bRETURNING\b/i.test(text)?text+' RETURNING id':text;const result=await query(sql,args);return {changes:result.rowCount,lastInsertRowid:result.rows[0]?.id}}
 }},exec(text){return (scope.getStore()||pool).query(text)},
 async transaction(fn,{snapshot=false}={}){
  if(scope.getStore())return fn();const client=await pool.connect();let begun=false;
  try{await client.query(snapshot?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');begun=true;
   // Cross-process lock serializes all business writes, including setup and reservations.
   // Each read follows the lock under READ COMMITTED, so it sees the latest committed state.
   if(!snapshot)await client.query('SELECT pg_advisory_xact_lock(8675309,2026)');
   const value=await scope.run(client,fn);await client.query('COMMIT');return value;
  }catch(error){if(begun)await client.query('ROLLBACK').catch(()=>{});throw error}finally{client.release()}
 },async resetSequences(){for(const table of identities)await query(`SELECT setval(pg_get_serial_sequence('your_car.${table}','id'), COALESCE((SELECT MAX(id) FROM your_car.${table}),1), EXISTS(SELECT 1 FROM your_car.${table}))`)},async close(){await pool.end()}};
 return db;
}
export async function createPostgresStorage(){
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL é obrigatória para Supabase.');
 const url=new URL(process.env.DATABASE_URL);if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('DATABASE_URL deve ser PostgreSQL.');
 // Credentials never enter logs. Use the Supabase CA for certificate verification.
 if(!process.env.DATABASE_SSL_CA)throw Error('DATABASE_SSL_CA deve conter o certificado CA do Supabase (PEM).');
 url.searchParams.delete('sslmode');url.searchParams.delete('sslrootcert');
 const pool=new pg.Pool({connectionString:url.href,max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:10000,ssl:{rejectUnauthorized:true,ca:process.env.DATABASE_SSL_CA},statement_timeout:30000});
 pool.on('error',error=>console.error('PostgreSQL pool error',{name:error.name}));
 try{await pool.query('SELECT id FROM your_car.users LIMIT 1');return {db:postgresAdapter(pool),raw:null,provider:'supabase'}}catch(error){await pool.end();throw error}
}
