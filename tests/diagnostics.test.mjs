import test from 'node:test';
import assert from 'node:assert/strict';
import {rootCertificates} from 'node:tls';
import {postgresConfig} from '../server/postgres.mjs';
import {safeErrorDiagnostic} from '../server/diagnostics.mjs';
import {handleVercelRequest} from '../server/vercel-handler.mjs';

const password='fictional-pass@123',url='postgresql://owner:'+encodeURIComponent(password)+'@example.invalid:6543/postgres';
test('diagnóstico sanitiza mensagem, stack e causas sem serializar input/config',()=>{
 const env={DATABASE_URL:url,AUTH_SECRET:'fictional-auth-unique',SUPABASE_SECRET_KEY:'fictional-storage-unique'};
 const error=Object.assign(new TypeError(`connection ${url}; password ${password}; ${env.AUTH_SECRET}`),{code:'ERR_INVALID_URL',stage:'postgres-config',input:url,config:env});
 error.cause=new Error(`chave ${env.SUPABASE_SECRET_KEY}; token=unknown-test-token; Bearer fictional-bearer; "api_key":"fictional-json-key"; postgresql://other:unknown@example.invalid/db; sb_secret_fakeexample`);
 const diagnostic=safeErrorDiagnostic(error,'initialization',env),text=JSON.stringify(diagnostic);
 for(const secret of [url,password,encodeURIComponent(password),env.AUTH_SECRET,env.SUPABASE_SECRET_KEY,'unknown-test-token','unknown@example.invalid','sb_secret_fakeexample','fictional-bearer','fictional-json-key'])assert.ok(!text.includes(secret));
 assert.equal(diagnostic.name,'TypeError');assert.equal(diagnostic.code,'ERR_INVALID_URL');assert.match(diagnostic.stack,/diagnostics.test.mjs/);assert.equal(diagnostic.stage,'postgres-config');assert.ok(diagnostic.cause.stack);assert.equal(diagnostic.input,undefined);assert.equal(diagnostic.config,undefined);
 error.cause=error;assert.doesNotThrow(()=>safeErrorDiagnostic(error));assert.doesNotThrow(()=>safeErrorDiagnostic(null));
});

test('PostgreSQL identifica URL inválida, marcadores, senha ausente e CA inválida sem conexão',()=>{
 const base={DATABASE_URL:url,DATABASE_SSL_CA:rootCertificates[0]};
 for(const [env,code] of [
 [{},'DATABASE_URL_MISSING'],[{...base,DATABASE_URL:'postgresql://owner:password@'},'DATABASE_URL_INVALID'],
 [{...base,DATABASE_URL:'https://example.invalid'},'DATABASE_URL_PROTOCOL'],
 [{...base,DATABASE_URL:'postgresql://owner@example.invalid/db'},'DATABASE_URL_PASSWORD'],
 [{...base,DATABASE_URL:'postgresql://owner:%ZZ@example.invalid/db'},'DATABASE_URL_ENCODING'],
 [{...base,DATABASE_URL:'postgresql://owner:%5BYOUR-PASSWORD%5D@example.invalid/db'},'DATABASE_URL_PLACEHOLDER'],
 [{...base,DATABASE_SSL_CA:''},'DATABASE_SSL_CA_MISSING'],[{...base,DATABASE_SSL_CA:'C:/certificate.crt'},'DATABASE_SSL_CA_FORMAT'],
 [{...base,DATABASE_SSL_CA:'-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----'},'DATABASE_SSL_CA_INVALID']
 ])assert.throws(()=>postgresConfig(env),error=>error.code===code&&error.stage==='postgres-config');
 const config=postgresConfig({...base,DATABASE_URL:url+'?sslmode=disable&sslcert=bad&sslkey=bad&sslrootcert=bad&ssl=false',DATABASE_SSL_CA:base.DATABASE_SSL_CA.replace(/\n/g,'\\n')});
 assert.equal(config.ssl.rejectUnauthorized,true);assert.equal(config.ssl.ca,base.DATABASE_SSL_CA);assert.equal(new URL(config.connectionString).search,'');
});

test('Vercel retorna 503 genérico e logs seguros; uma inicialização falha pode ser tentada novamente',async()=>{
 const previous=process.env.DATABASE_URL,log=console.error,logs=[];console.error=(...args)=>logs.push(args);
 try{
  for(const bad of ['postgresql://owner:fictional-private-password@','https://wrong.invalid']){
   process.env.DATABASE_URL=bad;let status,body,headers;
   const res={headersSent:false,writeHead(code,h){status=code;headers=h;this.headersSent=true},end(value){body=value}};
   await handleVercelRequest({},res);assert.equal(status,503);assert.equal(headers['Cache-Control'],'no-store');assert.deepEqual(JSON.parse(body),{error:'Serviço indisponível. Confira a configuração do servidor.'});assert.ok(!body.includes(bad));
  }
  assert.equal(logs.length,2);assert.equal(logs[0][1].code,'DATABASE_URL_INVALID');assert.equal(logs[1][1].code,'DATABASE_URL_PROTOCOL');assert.ok(logs[0][1].message);assert.ok(logs[0][1].stack);assert.ok(logs[0][1].cause.stack);assert.ok(!JSON.stringify(logs).includes('fictional-private-password'));
 }finally{console.error=log;if(previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previous}
});
