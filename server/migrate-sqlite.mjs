import {DatabaseSync} from 'node:sqlite';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createStorage} from './storage.mjs';

export const dataTables=['users','vehicles','customers','leads','orders','expenses','appointments','settings','notifications','sales','payments','audit','public_requests','media_uploads','order_tracking'];
export async function importSQLite(sourcePath,destination){
 const source=new DatabaseSync(sourcePath,{readOnly:true});
 try{
  source.exec('BEGIN');
  if(source.prepare('PRAGMA foreign_key_check').all().length)throw Error('O SQLite de origem contém relações inválidas. Corrija antes de importar.');
  const existing=new Set(source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
  const rows=Object.fromEntries(dataTables.map(table=>[table,existing.has(table)?source.prepare(`SELECT * FROM ${table}`).all():[]]));
  const counts=await destination.transaction(async()=>{
   for(const table of dataTables)if((await destination.prepare(`SELECT COUNT(*) n FROM ${table}`).get()).n)throw Error(`Destino não está vazio: ${table}. Nenhum registro foi importado.`);
   const result={};
   for(const table of dataTables){
    if(table==='order_tracking'){if(!existing.has(table)){result[table]=(await destination.prepare("SELECT COUNT(*) n FROM order_tracking").get()).n;continue}await destination.prepare("DELETE FROM order_tracking").run()}
    for(const row of rows[table]){
     const columns=Object.keys(row);if(columns.some(name=>!/^\w+$/.test(name)))throw Error('Coluna inválida na origem.');
     await destination.prepare(`INSERT INTO ${table}(${columns.map(name=>`"${name}"`).join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...columns.map(name=>row[name]));
    }
    result[table]=(await destination.prepare(`SELECT COUNT(*) n FROM ${table}`).get()).n;
    if(Number(result[table])!==rows[table].length)throw Error(`Contagem divergente em ${table}. Importação revertida.`);
   }
   if(destination.provider!=='supabase'&&(await destination.prepare('PRAGMA foreign_key_check').all()).length)throw Error('Integridade do destino inválida. Importação revertida.');
   if(destination.resetSequences)await destination.resetSequences();
   return result;
  });
  return counts;
 }finally{source.close()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const root=dirname(dirname(fileURLToPath(import.meta.url)));
 const source=resolve(process.argv[2]||join(root,'database','yor-car.sqlite'));
 let storage;try{storage=await createStorage({production:true});console.log(await importSQLite(source,storage.db));console.log('Importação confirmada. Origem local preservada.')}catch(error){console.error('Importação interrompida.',/Destino não está vazio|Contagem divergente|integridade|origem/i.test(error.message)?error.message:error.name);process.exitCode=1}finally{await storage?.db.close()}
}
