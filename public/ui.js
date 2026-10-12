export const $=(s,root=document)=>root.querySelector(s),$$=(s,root=document)=>[...root.querySelectorAll(s)];
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:2}).format((Number(v)||0)/100);
export const number=v=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(Number(v)||0);
export const date=v=>v?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Bahia'}).format(new Date(v.length===10?v+'T12:00:00Z':v)):'—';
export const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Bahia'});
export const state={user:null,setup:false,setupSecretRequired:false,public:null,lookups:null,route:0};
export const labels={RECEBIDO:'Recebido',EM_PREPARO:'Em preparo',PRONTO:'Pronto',DISPONIVEL:'Disponível',RESERVADO:'Reservado',VENDIDO:'Vendido',NOVO:'Novo',CONTATO:'Em contato',NEGOCIACAO:'Negociação',CONVERTIDO:'Convertido',PERDIDO:'Perdido',PENDENTE:'Pendente',CONCLUIDO:'Concluído',CANCELADO:'Cancelado',CONFIRMADO:'Confirmado',ADMIN:'Administrador',VENDEDOR:'Vendedor'};
export const badge=v=>`<span class="badge ${esc(v?.toLowerCase())}">${esc(labels[v]||v||'—')}</span>`;
export const logo=()=>'<a class="logo" data-link href="/" aria-label="Your Car, início">Your <span>Car</span><i></i></a>';
const paths={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',car:'M3 16v-5l2-6h14l2 6v5 M3 11h18 M5 16v3 M19 16v3 M6 14h2 M16 14h2',users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 4a4 4 0 0 1 0 7 M22 21v-2a4 4 0 0 0-3-4',trend:'M3 17l6-6 4 4 8-10 M15 5h6v6',wallet:'M3 6h17v15H3z M3 6V3h14 M15 12h6v5h-6z',calendar:'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16',bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',file:'M6 2h9l5 5v15H6z M14 2v6h6 M9 12h8 M9 16h8',logout:'M9 4H4v16h5 M13 8l4 4-4 4 M8 12h13',search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6',arrow:'M4 12h16 M14 6l6 6-6 6',check:'M4 12l5 5L20 6',plus:'M12 5v14 M5 12h14',menu:'M3 6h18 M3 12h18 M3 18h18',heart:'M12 21S2 15 2 8a5 5 0 0 1 10-2A5 5 0 0 1 22 8c0 7-10 13-10 13',box:'M3 7l9-5 9 5v10l-9 5-9-5z M3 7l9 5 9-5 M12 12v10',shield:'M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6z M8 12l3 3 5-6'};
export const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.grid}"/></svg>`;
export async function api(path,options={}){const response=await fetch('/api'+path,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options,body:options.body?JSON.stringify(options.body):undefined});const data=await response.json();if(!response.ok){const error=new Error(data.error||'Falha ao comunicar com o servidor.');error.status=response.status;throw error}return data}
export function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),4500)}
export function navigate(path,replace=false){history[replace?'replaceState':'pushState']({},'',path);window.dispatchEvent(new Event('yor:navigate'))}
let lastFocus;
export function modal(title,content){const el=$('#modal');lastFocus=document.activeElement;el.innerHTML=`<div class="modal-head"><h2 id="modal-title">${esc(title)}</h2><button type="button" class="icon-button" data-close aria-label="Fechar">×</button></div>${content}`;if(!el.open)el.showModal();$('[data-close]',el).onclick=()=>el.close();el.onclose=()=>lastFocus?.isConnected&&lastFocus.focus();el.onclick=e=>{if(e.target===el&&e.clientX){const r=el.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)el.close()}};return el}
export function field(name,label,type='text',value='',extra=''){return `<label class="field"><span>${esc(label)}</span><input name="${esc(name)}" type="${type}" value="${esc(value)}" ${extra}></label>`}
export function select(name,label,items,value='',extra=''){return `<label class="field"><span>${esc(label)}</span><select name="${esc(name)}" ${extra}>${items.map(item=>{const [v,t]=Array.isArray(item)?item:[item,labels[item]||item];return `<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(t)}</option>`}).join('')}</select></label>`}
export function submit(form,callback){form.addEventListener('submit',async e=>{e.preventDefault();const button=$('[type=submit]',form),error=$('.form-error',form);if(button.disabled)return;button.disabled=true;const old=button.innerHTML;button.textContent='Salvando…';if(error)error.textContent='';try{await callback(Object.fromEntries(new FormData(form)))}catch(err){if(error)error.textContent=err.message;else toast(err.message)}finally{button.disabled=false;button.innerHTML=old}})}
export const formEnd=(text='Salvar')=>`<p class="form-error" role="alert"></p><button class="button primary" type="submit">${esc(text)} ${icon('arrow')}</button>`;
export const empty=(text='Nenhum registro encontrado.')=>`<div class="empty">${icon('box')}<p>${esc(text)}</p></div>`;
const revealed=new WeakSet();
export function reveal(root=document){
 if(!('IntersectionObserver'in window)||!Element.prototype.animate)return;
 const preference=matchMedia('(prefers-reduced-motion: reduce)');if(preference.matches)return;
 const active=new Set(),groups=new WeakMap();let observer,changes;
 const stop=()=>{observer?.disconnect();changes?.disconnect();active.forEach(animation=>animation.cancel());active.clear()};
 const reduce=()=>{if(preference.matches)stop()};
 try{
  observer=new IntersectionObserver(entries=>entries.forEach(({target,isIntersecting})=>{
   if(!isIntersecting)return;observer.unobserve(target);if(revealed.has(target))return;revealed.add(target);
   if(preference.matches)return;
   try{const animation=target.animate([{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}],{duration:480,delay:Number(target.dataset.revealDelay||0),easing:'cubic-bezier(.2,.7,.3,1)',fill:'backwards'});active.add(animation);animation.onfinish=animation.oncancel=()=>active.delete(animation)}catch{}
  }),{threshold:.06});
  const scan=()=>{const isPublic=!document.body.classList.contains('is-admin'),selector=isPublic?'#main h1,#main h2,#main h3,#main p,#main img:not(.cover-image),#main .vehicle-card,#main .step':'[data-reveal]';
   $$(selector,root).forEach(el=>{if(revealed.has(el)||el.dataset.revealWatching||el.parentElement?.closest('.vehicle-card,.step'))return;el.dataset.revealWatching='1';const group=el.closest('section')||el.parentElement,index=groups.get(group)||0;groups.set(group,index+1);el.dataset.revealDelay=String(index%3*55);observer.observe(el)})};
  scan();changes=new MutationObserver(scan);changes.observe(root===document?document.body:root,{childList:true,subtree:true});preference.addEventListener('change',reduce);
  return ()=>{stop();preference.removeEventListener('change',reduce)};
 }catch{stop()}
}
export function csv(name,rows){if(!rows.length)return toast('Não há dados para exportar.');const keys=Object.keys(rows[0]);const cell=v=>'"'+String(v??'').replace(/^[\s]*[=+@-]/,match=>"'"+match).replaceAll('"','""')+'"';const blob=new Blob(['\ufeff'+[keys,...rows.map(r=>keys.map(k=>r[k]))].map(row=>row.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
