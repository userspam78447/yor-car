import {$,state,api,navigate,reveal,toast,esc} from './ui.js?v=4';
import {publicPage,bindPublic,publicAction} from './public.js?v=4';
let admin;
const loadAdmin=async()=>admin??=await import('./admin.js?v=4');

let cleanup;
async function render(){const token=++state.route,path=location.pathname.replace(/\/$/,'')||'/';cleanup?.();document.body.classList.toggle('is-admin',path.startsWith('/admin'));document.body.classList.toggle('is-public-home',path==='/');const app=$('#app');app.setAttribute('aria-busy','true');try{
 const session=await api('/session');if(token!==state.route)return;state.user=session.user;state.setup=session.setup;state.setupSecretRequired=!!session.setupSecretRequired;state.directUpload=!!session.directUpload;
 if(path.startsWith('/admin')&&!state.user){navigate(state.setup?'/setup':'/login',true);return}
 if(path==='/setup'&&!state.setup){navigate(state.user?'/admin':'/login',true);return}
 if(path==='/login'&&state.setup){navigate('/setup',true);return}
 if(!state.public)state.public=await api('/public');if(token!==state.route)return;
 const isAuth=['/login','/setup'].includes(path);if(isAuth||path.startsWith('/admin'))await loadAdmin();let html=isAuth?admin.authPage(path==='/setup'):path.startsWith('/admin')?await admin.adminPage(path):publicPage(path);if(token!==state.route)return;app.innerHTML=html;app.setAttribute('aria-busy','false');
 if(isAuth)admin.bindAuth(path==='/setup');else if(path.startsWith('/admin'))await admin.bindAdmin();else bindPublic();cleanup=reveal();document.title=path.startsWith('/admin')?'Your Car — Painel administrativo':path==='/login'?'Your Car — Entrar':path==='/setup'?'Your Car — Primeiro acesso':$('h1')?.textContent+' | Your Car';window.scrollTo({top:0,behavior:'instant'});$('#main')?.focus({preventScroll:true});
 }catch(e){if(token!==state.route)return;app.setAttribute('aria-busy','false');app.innerHTML=`<main id="main" class="container section"><h1>Não conseguimos abrir esta página.</h1><p>${esc(e.message)}</p><button class="button primary" data-retry>Tentar novamente</button><a data-link class="button outline" href="/">Voltar ao início</a></main>`}}
document.addEventListener('click',async e=>{const link=e.target.closest('a[data-link]');if(link&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&e.button===0){const url=new URL(link.href);if(url.origin!==location.origin)return;e.preventDefault();$('#modal').open&&$('#modal').close();navigate(url.pathname+url.search+url.hash);return}const button=e.target.closest('button,[data-favorite]');if(!button)return;try{if('retry'in button.dataset)return render();await publicAction(button);if(admin&&location.pathname.startsWith('/admin'))await admin.adminAction(button)}catch(error){toast(error.message||'Não foi possível concluir a operação.')}});
window.addEventListener('popstate',render);window.addEventListener('yor:navigate',render);render();
