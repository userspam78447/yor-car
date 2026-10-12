import {createApp} from './index.mjs';

let appPromise;
export async function handleVercelRequest(req,res){
 try{
  appPromise??=createApp({production:true,databaseMode:'supabase'}).catch(error=>{appPromise=null;throw error});
  const {server}=await appPromise;
  await server.listeners('request')[0](req,res);
 }catch(error){console.error('Your Car initialization failed',{name:error.name});if(!res.headersSent){res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Serviço indisponível. Confira a configuração do servidor.'}))}}
}
