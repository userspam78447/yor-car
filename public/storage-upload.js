// Only a scoped upload capability reaches the browser; no project secret is sent.
export async function uploadSigned(auth,file){
 const url=new URL(auth.signedUrl);if(url.protocol!=='https:'||url.origin!==new URL(auth.supabaseUrl).origin||!url.pathname.startsWith('/storage/v1/object/upload/sign/vehicle-images/'))throw Error('Destino de envio inválido.');
 const body=new FormData();body.append('cacheControl','3600');body.append('',file);
 const response=await fetch(url,{method:'PUT',body,credentials:'omit',headers:{'x-upsert':'false'}});if(!response.ok)throw Error('Não foi possível enviar a foto. Tente novamente.');
}
