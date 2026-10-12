import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStorage} from '../server/storage.mjs';

test('camada assíncrona mantém transações locais atômicas',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'yor-storage-')),storage=await createStorage({path:join(dir,'test.sqlite')});
 try{
  await storage.db.transaction(async()=>{await storage.db.prepare("INSERT INTO settings(name,value) VALUES(?,?)").run('probe','persistido')});
  assert.equal((await storage.db.prepare('SELECT value FROM settings WHERE name=?').get('probe')).value,'persistido');
  await assert.rejects(storage.db.transaction(async()=>{await storage.db.prepare("INSERT INTO settings(name,value) VALUES(?,?)").run('rolled-back','x');throw Error('falha simulada')}),/falha simulada/);
  assert.equal(await storage.db.prepare('SELECT id FROM settings WHERE name=?').get('rolled-back'),undefined);
 }finally{storage.db.close();rmSync(dir,{recursive:true,force:true})}
});
