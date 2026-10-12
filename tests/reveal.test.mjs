import test from 'node:test';
import assert from 'node:assert/strict';
import {reveal} from '../public/ui.js';

test('scroll reveal: uma vez, movimento reduzido e falha mantêm conteúdo acessível',()=>{
 const names=['window','document','Element','matchMedia','IntersectionObserver','MutationObserver'],saved=new Map(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 let callback,observations=0,animations=0,reduced=false,failAnimation=false;
 const group={},element={dataset:{},parentElement:{closest:()=>null},closest:()=>group,animate(){animations++;if(failAnimation)throw Error('Animation unavailable');return {cancel(){}}}};
 const document={body:{classList:{contains:()=>false}},querySelectorAll:()=>[element]};
 const Observer=class{constructor(fn){callback=fn}observe(){observations++}unobserve(){}disconnect(){}};
 try{
  Object.assign(globalThis,{document,window:{IntersectionObserver:Observer},Element:class{},matchMedia:()=>({matches:reduced,addEventListener(){},removeEventListener(){}}),IntersectionObserver:Observer,MutationObserver:class{observe(){}disconnect(){}}});
  Element.prototype.animate=()=>{};
  reduced=true;assert.equal(reveal(),undefined);assert.equal(observations,0);assert.deepEqual(element.dataset,{});
  reduced=false;let cleanup=reveal();callback([{target:element,isIntersecting:true}]);callback([{target:element,isIntersecting:true}]);assert.equal(animations,1);cleanup();
  const next={...element,dataset:{}};document.querySelectorAll=()=>[next];failAnimation=true;cleanup=reveal();assert.doesNotThrow(()=>callback([{target:next,isIntersecting:true}]));assert.equal(next.style,undefined);assert.equal(next.hidden,undefined);cleanup();
 }finally{for(const [key,value] of saved)value?Object.defineProperty(globalThis,key,value):delete globalThis[key]}
});
