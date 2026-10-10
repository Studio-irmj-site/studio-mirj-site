const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
// Small DOM fixture: exercise the real wizard without a browser or live account.
class Element{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.childNodes=this.children;this.dataset={};this.hidden=false;this.className='';this.classList={toggle:()=>{}};this.listeners={};this.validity={valid:true};this.value='';this.textContent='';}
 append(...nodes){for(const n of nodes){if(n.parentElement)n.parentElement.children.splice(n.parentElement.children.indexOf(n),1);n.parentElement=this;this.children.push(n);}}
 prepend(...nodes){for(const n of [...nodes].reverse()){this.append(n);this.children.pop();this.children.unshift(n);}}
 before(node){const p=this.parentElement;p.children.splice(p.children.indexOf(this),0,node);node.parentElement=p;}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 setAttribute(){}
 addEventListener(type,fn){this.listeners[type]=fn;}
 closest(tag){return this.parentElement?.tagName===tag.toUpperCase()?this.parentElement:this.parentElement?.closest(tag);}
 contains(node){return this===node||this.children.some(c=>c.contains?.(node));}
 querySelectorAll(selector){const tags=selector==='button'?['BUTTON']:['INPUT','SELECT','TEXTAREA'];return this.children.flatMap(c=>[...(tags.includes(c.tagName)?[c]:[]),...c.querySelectorAll(selector)]);}
 querySelector(selector){return selector==='button.primary'?this.children.find(c=>c.className==='primary'):this.querySelectorAll(selector)[0];}
 focus(){}
 reportValidity(){this.reports=(this.reports||0)+1;}
 set innerHTML(value){this.children=[];if(value.includes('Continuar')){this.append(new Element('button'),new Element('button'));}}
}
function fixture(){
 const nodes={},form=new Element('form');form.id='attendanceForm';
 const config=[['Cliente e serviço',['aClient','aService']],['Pagamento',['aAmount','aPayment','aDate']],['Conferir e registrar',['aNotes']]];
 for(const [,ids]of config)for(const id of ids){const label=new Element('label'),input=new Element('input');input.id=id;input.value=id;label.append(input);form.append(label);nodes[id]=input;}
 const save=new Element('button');save.className='primary';form.append(save);
 const checks=new WeakMap(),context={document:{createElement:t=>new Element(t),getElementById:id=>nodes[id]},formSteps:{attendanceForm:config},submitChecks:checks};vm.createContext(context);
 const source=fs.readFileSync('admin/compact-panel.js','utf8');vm.runInContext(source.slice(source.indexOf('  function wizard('),source.indexOf('  function enhance('))+'\nthis.setup=wizard;',context);context.setup(form);
 const steps=()=>form.children.filter(c=>c.className==='ir-step-panel');
 const next=()=>form.children.find(c=>c.className==='ir-wizard-actions').children[1].onclick();
 const submit=()=>{const e={prevented:false,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};checks.get(form)(e);return e;};
 return{form,nodes,save,steps,next,submit};
}
test('cadastro só libera gravação após as três etapas e mantém valores',()=>{
 const f=fixture();assert.deepEqual(f.steps().map(p=>p.hidden),[false,true,true]);assert.equal(f.save.hidden,true);
 assert.equal(f.submit().prevented,true);assert.deepEqual(f.steps().map(p=>p.hidden),[true,false,true]);
 f.next();assert.equal(f.save.hidden,false);assert.equal(f.submit().prevented,false);assert.equal(f.nodes.aClient.value,'aClient');
});
test('campo obrigatório bloqueia avanço',()=>{
 const f=fixture();f.nodes.aClient.validity.valid=false;f.next();assert.equal(f.steps()[0].hidden,false);assert.equal(f.save.hidden,true);assert.equal(f.nodes.aClient.reports,1);
});
test('validação final volta à etapa inválida antes de qualquer gravação',()=>{
 const f=fixture();f.next();f.next();f.nodes.aAmount.validity.valid=false;const event=f.submit();assert.equal(event.prevented,true);assert.equal(event.stopped,true);assert.equal(f.steps()[1].hidden,false);assert.equal(f.save.hidden,true);
});
