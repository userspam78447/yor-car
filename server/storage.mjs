
import {AsyncLocalStorage} from 'node:async_hooks';

import {openDB} from './domain.mjs';

const localScope=new AsyncLocalStorage();
function localAdapter(raw){
 let tail=Promise.resolve();
 const direct=fn=>{if(localScope.getStore()===sql)return Promise.resolve().then(fn);const result=tail.then(fn);tail=result.catch(()=>{});return result};
 const sql={prepare(text){return {get(...args){return direct(()=>raw.prepare(text).get(...args))},all(...args){return direct(()=>raw.prepare(text).all(...args))},run(...args){return direct(()=>raw.prepare(text).run(...args))}}},exec(text){return direct(()=>raw.exec(text))},transaction(fn){if(localScope.getStore()===sql)return Promise.resolve().then(fn);return direct(async()=>{raw.exec('BEGIN IMMEDIATE');try{const result=await localScope.run(sql,fn);raw.exec('COMMIT');return result}catch(e){raw.exec('ROLLBACK');throw e}})},raw,close(){raw.close()}};
 return sql;
}
export async function createStorage({path,production=false}={}){
 if(production){const {createPostgresStorage}=await import('./postgres.mjs');return createPostgresStorage()}
 const raw=openDB(path);raw.exec('CREATE TABLE IF NOT EXISTS public_requests(reference TEXT PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id)); CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,window_start INTEGER NOT NULL,count INTEGER NOT NULL)');
 raw.exec("CREATE TABLE IF NOT EXISTS media_uploads(pathname TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),url TEXT UNIQUE,state TEXT NOT NULL,created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
 return {db:localAdapter(raw),raw,provider:'sqlite'};
}
