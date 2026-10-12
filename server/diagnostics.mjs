// Error diagnostics whitelist fields; never serialize the raw Error or its input/config.
export function redactDiagnostic(value,env=process.env){
 let text=String(value??'');const secrets=new Set();
 for(const [key,value] of Object.entries(env))if(value&&/(?:DATABASE_URL|PASSWORD|TOKEN|SECRET|KEY)/i.test(key))secrets.add(String(value));
 try{const url=new URL(env.DATABASE_URL);for(const value of [url.password,url.searchParams.get('password')])if(value){secrets.add(value);try{secrets.add(decodeURIComponent(value))}catch{}}}catch{}
 for(const value of [...secrets]){secrets.add(encodeURIComponent(value));secrets.add(JSON.stringify(value).slice(1,-1))}
 for(const secret of [...secrets].sort((a,b)=>b.length-a.length))text=text.split(secret).join('[REDACTED]');
 return text.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi,'[REDACTED_DATABASE_URL]')
 .replace(/\b(?:sbp_|sb_secret_|sb_publishable_|github_pat_|gh[pousr]_)[A-Za-z0-9_-]+/g,'[REDACTED_TOKEN]')
 .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[REDACTED_TOKEN]')
 .replace(/\bBearer\s+[^\s"']+/gi,'Bearer [REDACTED]')
 .replace(/((["']?(?:password|passwd|token|secret|api[_-]?key|authorization)["']?)\s*[=:]\s*)("[^"\n]*"|'[^'\n]*'|[^\s,;]+)/gi,'$1[REDACTED]');
}
export function safeErrorDiagnostic(error,stage='initialization',env=process.env){
 const seen=new Set();const visit=(item,depth)=>{
  if(depth>3||seen.has(item))return undefined;seen.add(item);
  if(!item||typeof item!=='object')return {message:redactDiagnostic(item,env)};
  const result={name:redactDiagnostic(item.name||'Error',env),message:redactDiagnostic(item.message||'Falha sem mensagem.',env),stack:redactDiagnostic(item.stack||'',env)};
  if(item.code!==undefined)result.code=redactDiagnostic(item.code,env);
  if(item.stage!==undefined)result.stage=redactDiagnostic(item.stage,env);
  if(item.cause!==undefined)result.cause=visit(item.cause,depth+1);
  return result;
 };
 return {stage,...visit(error,0)};
}
