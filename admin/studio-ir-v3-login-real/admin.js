const DEFAULT_CATEGORIES=["Manicure","Alongamento","Decorações"];
const STORAGE_KEY="studio_ir_admin_services_v1";
const defaultServices=[
 {id:"pe_mao",name:"Pé e Mão",category:"Manicure",desc:"Manicure tradicional completa",price:80,unit:"",active:true},
 {id:"mao",name:"Mão",category:"Manicure",desc:"Manicure tradicional",price:40,unit:"",active:true},
 {id:"pe",name:"Pé",category:"Manicure",desc:"Pedicure tradicional",price:50,unit:"",active:true},
 {id:"cuticulagem",name:"Cuticulagem",category:"Manicure",desc:"Fina e grossa, com calma",price:35,unit:"",active:true},
 {id:"esm_comum",name:"Esmaltação Comum",category:"Manicure",desc:"Esmalte tradicional",price:25,unit:"",active:true},
 {id:"esm_gel_pe",name:"Esmaltação em Gel (pé)",category:"Manicure",desc:"Acabamento em gel",price:85,unit:"",active:true},
 {id:"spa_pes",name:"Spa dos Pés",category:"Manicure",desc:"Hidratação + esfoliação",price:90,unit:"",active:true},
 {id:"fibra_vidro",name:"Fibra de Vidro",category:"Alongamento",desc:"Alongamento em fibra",price:150,unit:"",active:true},
 {id:"outros_formatos",name:"Outros Formatos",category:"Alongamento",desc:"Alongamento em gel",price:160,unit:"",active:true},
 {id:"blindagem_gel",name:"Blindagem + Esmaltação em Gel",category:"Alongamento",desc:"Reforço + acabamento em gel",price:100,unit:"",active:true},
 {id:"banho_gel",name:"Banho em Gel + Esmaltação em Gel",category:"Alongamento",desc:"Camada de gel + acabamento",price:120,unit:"",active:true},
 {id:"encapsulada",name:"Encapsulada",category:"Decorações",desc:"Efeito encapsulado",price:10,unit:"por unha",active:true},
 {id:"fibra_avulsa",name:"Fibra Avulsa",category:"Decorações",desc:"Reparo pontual em fibra",price:10,unit:"por unha",active:true},
 {id:"remocao_fibra",name:"Remoção de Fibra",category:"Decorações",desc:"Retirada segura",price:60,unit:"",active:true},
 {id:"francesinha",name:"Francesinha",category:"Decorações",desc:"Clássica e delicada",price:5,unit:"o par",active:true},
 {id:"decoracao",name:"Decoração",category:"Decorações",desc:"Detalhes personalizados",price:3,unit:"o par",active:true}
];

let services=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null")||defaultServices;
const $=s=>document.querySelector(s);
const $$=s=>document.querySelectorAll(s);
let sb = null;
if (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url.startsWith("http") &&
    window.SUPABASE_CONFIG.anonKey && !window.SUPABASE_CONFIG.anonKey.includes("COLE_AQUI")) {
  sb = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
}
const save=()=>localStorage.setItem(STORAGE_KEY,JSON.stringify(services));

async function ensureAdmin(){
  if(!sb) return false;
  const {data:{user}}=await sb.auth.getUser();
  if(!user) return false;
  const {data,error}=await sb.from("admins").select("user_id").eq("user_id",user.id).maybeSingle();
  if(error || !data){ await sb.auth.signOut(); alert("Este usuário não possui acesso de administrador."); return false; }
  return true;
}
async function loadFromSupabase(){
  if(!sb) return;
  const {data,error}=await sb.from("services").select("*").order("sort_order",{ascending:true}).order("name");
  if(error){ console.warn("Supabase:",error.message); return; }
  services=(data||[]).map(s=>({id:s.id,name:s.name,category:s.category,desc:s.description||"",price:Number(s.price),unit:s.unit||"",active:s.active}));
  save(); render();
}
async function upsertSupabase(s){
  if(!sb) return;
  const {error}=await sb.from("services").upsert({
    id: /^[0-9a-f-]{36}$/i.test(s.id)?s.id:undefined,
    name:s.name, category:s.category, description:s.desc||null,
    price:s.price, unit:s.unit||null, active:s.active, updated_at:new Date().toISOString()
  });
  if(error) console.warn("Supabase:",error.message);
}
async function deleteSupabase(id){
  if(!sb || !/^[0-9a-f-]{36}$/i.test(id)) return;
  const {error}=await sb.from("services").delete().eq("id",id);
  if(error) console.warn("Supabase:",error.message);
}

$("#loginForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const email=$("#email").value.trim();
 const password=$("#password").value;
 if(!sb){ alert("Configure a chave pública do Supabase em supabase-config.js."); return; }
 const {error}=await sb.auth.signInWithPassword({email,password});
 if(error){ alert("E-mail ou senha inválidos."); return; }
 showApp();
});
$("#logoutBtn").onclick=async()=>{ if(sb) await sb.auth.signOut(); location.reload(); };

async function showApp(){
  if(sb && !(await ensureAdmin())) return;
  $("#loginScreen").classList.add("hidden"); $("#app").classList.remove("hidden"); render(); loadFromSupabase();
}
(async()=>{
  if(!sb){ return; }
  const {data:{session}}=await sb.auth.getSession();
  if(session) showApp();
})();

$$(".nav-item").forEach(btn=>btn.onclick=()=>{
 $$(".nav-item").forEach(x=>x.classList.remove("active"));btn.classList.add("active");
 $$(".view").forEach(v=>v.classList.add("hidden"));
 $("#"+btn.dataset.view+"View").classList.remove("hidden");
 $("#pageTitle").textContent=btn.querySelector("span").textContent;
 if(btn.dataset.view==="services") renderList();
});

$("#newService").onclick=$("#quickService").onclick=()=>openModal();
$("#closeModal").onclick=$("#cancelModal").onclick=()=>$("#modal").classList.add("hidden");
$("#search").oninput=renderList;
$("#categoryFilter").onchange=renderList;

function fillCategories(){
 const filter=$("#categoryFilter"), current=filter.value;
 filter.innerHTML='<option value="">Todas as categorias</option>'+DEFAULT_CATEGORIES.map(c=>`<option>${c}</option>`).join("");
 filter.value=current;
 $("#serviceCategory").innerHTML=DEFAULT_CATEGORIES.map(c=>`<option>${c}</option>`).join("");
}

function render(){
 fillCategories(); renderStats(); renderList();
}
function renderStats(){
 $("#statServices").textContent=services.length;
 $("#statActive").textContent=services.filter(s=>s.active).length;
 $("#statCategories").textContent=new Set(services.map(s=>s.category)).size;
}
function renderList(){
 const q=$("#search").value.toLowerCase(), cat=$("#categoryFilter").value;
 const filtered=services.filter(s=>(!q||[s.name,s.desc,s.category].join(" ").toLowerCase().includes(q))&&(!cat||s.category===cat));
 $("#serviceList").innerHTML=filtered.map(s=>`
 <div class="service-row">
  <div class="service-name">${escapeHtml(s.name)}<small>${escapeHtml(s.category)} · ${escapeHtml(s.desc||"")}</small></div>
  <div class="price">R$ ${Number(s.price).toFixed(2).replace(".",",")}${s.unit?` <small>${escapeHtml(s.unit)}</small>`:""}</div>
  <div class="badge ${s.active?"":"off"}">${s.active?"Ativo":"Oculto"}</div>
  <div class="row-actions"><button class="icon-btn" onclick="toggleService('${s.id}')">${s.active?"Ocultar":"Ativar"}</button><button class="icon-btn" onclick="editService('${s.id}')">Editar</button><button class="icon-btn" onclick="deleteService('${s.id}')">Excluir</button></div>
 </div>`).join("")||'<p class="muted">Nenhum serviço encontrado.</p>';
}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function openModal(s=null){
 $("#modal").classList.remove("hidden"); $("#modalTitle").textContent=s?"Editar serviço":"Novo serviço";
 $("#serviceId").value=s?.id||""; $("#serviceName").value=s?.name||""; $("#serviceCategory").value=s?.category||DEFAULT_CATEGORIES[0];
 $("#serviceDesc").value=s?.desc||""; $("#servicePrice").value=s?.price??""; $("#serviceUnit").value=s?.unit||""; $("#serviceActive").checked=s?s.active:true;
}
window.editService=id=>openModal(services.find(s=>s.id===id));
window.toggleService=async id=>{const s=services.find(s=>s.id===id);s.active=!s.active;save();render();await upsertSupabase(s)};
window.deleteService=async id=>{const s=services.find(s=>s.id===id);if(confirm(`Excluir "${s.name}"?`)){services=services.filter(x=>x.id!==id);save();render();await deleteSupabase(id)}};
$("#serviceForm").onsubmit=e=>{
 e.preventDefault();
 const id=$("#serviceId").value;
 const data={id:id||crypto.randomUUID(),name:$("#serviceName").value.trim(),category:$("#serviceCategory").value,desc:$("#serviceDesc").value.trim(),price:Number($("#servicePrice").value),unit:$("#serviceUnit").value,active:$("#serviceActive").checked};
 if(id){const i=services.findIndex(s=>s.id===id);services[i]=data}else services.push(data);
 save();$("#modal").classList.add("hidden");render(); await upsertSupabase(data);
};

$("#forgotPassword").onclick=async()=>{
  if(!sb){alert("Configure o Supabase primeiro.");return}
  const email=$("#email").value.trim();
  if(!email){alert("Digite seu e-mail primeiro.");return}
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:window.location.href});
  alert(error ? "Não foi possível enviar o e-mail de recuperação." : "Confira seu e-mail para redefinir a senha.");
};
