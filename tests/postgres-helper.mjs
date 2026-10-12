import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {postgresAdapter} from '../server/postgres.mjs';
export async function testPostgres(){
 const raw=await PGlite.create();let tail=Promise.resolve();
 const acquire=async()=>{let release;const previous=tail;tail=new Promise(resolve=>release=resolve);await previous;return release};
 const normalize=result=>({...result,rowCount:result.affectedRows??result.rows?.length??0});
 const direct=async(text,args)=>{if(args===undefined){const results=await raw.exec(text);return normalize(results.at(-1)||{rows:[]})}return normalize(await raw.query(text,args))};
 const pool={async query(text,args){const release=await acquire();try{return await direct(text,args)}finally{release()}},async connect(){const release=await acquire();return {query:direct,release}},async end(){await raw.close()}};
 await raw.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
 const file=(await readdir(new URL('../supabase/migrations/',import.meta.url))).find(f=>f.endsWith('_your_car_schema.sql'));
 await raw.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 return {db:postgresAdapter(pool),raw,provider:'supabase'};
}
