window.SUPABASE_CONFIG={url:"https://ihaizgqpeqnhztofqkar.supabase.co",anonKey:"sb_publishable_9A6K6mA2LD3Z-D3au0S85A_wFHKbhWv"};

(function(){
  const MARKER_RE=/^\[\[IR_SERVICE_IMAGE:(data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+)\]\]\s*/;
  const parseValue=value=>{const text=String(value||'');const m=text.match(MARKER_RE);return{image:m?m[1]:'',description:text.replace(MARKER_RE,'').trim()}};
  const composeValue=(image,description)=>`${image?`[[IR_SERVICE_IMAGE:${image}]]\n`:''}${String(description||'').trim()}`;

  function compressImage(file){
    return new Promise((resolve,reject)=>{
      if(!file||!/^image\/(jpeg|png|webp)$/i.test(file.type)){reject(new Error('Escolha uma imagem JPG, PNG ou WebP.'));return}
      if(file.size>8*1024*1024){reject(new Error('A imagem deve ter no máximo 8 MB.'));return}
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error('Não foi possível ler a imagem.'));
      reader.onload=()=>{
        const img=new Image();
        img.onerror=()=>reject(new Error('Não foi possível processar a imagem.'));
        img.onload=()=>{
          const max=520,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
          const w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
          const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
          const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
          let q=.82,data=canvas.toDataURL('image/jpeg',q);
          while(data.length>155000&&q>.48){q-=.08;data=canvas.toDataURL('image/jpeg',q)}
          resolve(data);
        };
        img.src=String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  function injectAdminStyle(){
    if(document.getElementById('ir-service-photo-admin-style'))return;
    const style=document.createElement('style');style.id='ir-service-photo-admin-style';style.textContent=`
      .ir-photo-field{display:grid;gap:10px;margin:14px 0 18px;padding:16px;border:1px solid rgba(75,22,48,.12);border-radius:18px;background:#fff8fc}
      .ir-photo-field>strong{color:#641337;font-size:13px}.ir-photo-field small{color:#78616c;line-height:1.45}
      .ir-photo-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.ir-photo-preview{width:92px;height:92px;border-radius:18px;overflow:hidden;background:#eee6ec;border:1px solid rgba(75,22,48,.10);display:grid;place-items:center;color:#8b7580;font-size:11px;text-align:center}
      .ir-photo-preview img{width:100%;height:100%;object-fit:cover;display:block}.ir-photo-file{max-width:260px}.ir-photo-remove{border:1px solid rgba(100,19,55,.18);background:#fff;color:#641337;border-radius:999px;padding:9px 13px;cursor:pointer;font-weight:700;font-size:11px}
      .service-card__photo{display:block;width:48px;height:48px;grid-row:1/3;border-radius:15px;overflow:hidden;background:#f3eaf5;box-shadow:0 5px 16px rgba(75,22,48,.10)}.service-card__photo img{width:100%;height:100%;object-fit:cover;display:block}.service-card.has-service-photo .service-card__icon{display:none}
    `;document.head.appendChild(style);
  }

  function enhanceServiceForm(){
    const form=document.getElementById('serviceForm'),textarea=document.getElementById('fDescription');
    if(!form||!textarea||form.dataset.photoEnhanced==='1')return;
    form.dataset.photoEnhanced='1';injectAdminStyle();
    const parsed=parseValue(textarea.value);textarea.value=parsed.description;
    const box=document.createElement('div');box.className='ir-photo-field';box.innerHTML='<strong>Foto do serviço</strong><small>Escolha uma foto para aparecer como ícone do serviço no site da cliente. A imagem será otimizada automaticamente.</small><div class="ir-photo-row"><div class="ir-photo-preview">Sem foto</div><input class="ir-photo-file" type="file" accept="image/jpeg,image/png,image/webp"><button class="ir-photo-remove" type="button">Remover foto</button></div><small class="ir-photo-status"></small>';
    textarea.closest('label')?.before(box);
    const preview=box.querySelector('.ir-photo-preview'),input=box.querySelector('.ir-photo-file'),remove=box.querySelector('.ir-photo-remove'),status=box.querySelector('.ir-photo-status');
    let image=parsed.image;
    const paint=()=>{preview.innerHTML=image?`<img src="${image}" alt="Prévia da foto do serviço">`:'Sem foto';remove.hidden=!image};paint();
    input.addEventListener('change',async()=>{const file=input.files?.[0];if(!file)return;status.textContent='Otimizando imagem...';input.disabled=true;try{image=await compressImage(file);paint();status.textContent='Imagem pronta para salvar.'}catch(e){status.textContent=e.message||'Não foi possível processar a imagem.';input.value=''}finally{input.disabled=false}});
    remove.addEventListener('click',()=>{image='';input.value='';paint();status.textContent='Foto removida. Salve o serviço para confirmar.'});
    form.addEventListener('submit',()=>{textarea.value=composeValue(image,textarea.value)},{capture:true});
  }

  function decoratePublicServices(){
    injectAdminStyle();
    document.querySelectorAll('.service-card').forEach(card=>{
      const p=card.querySelector('.service-card__copy p');if(!p||card.dataset.photoDecorated==='1')return;
      const parsed=parseValue(p.textContent);if(!parsed.image)return;
      card.dataset.photoDecorated='1';card.classList.add('has-service-photo');p.textContent=parsed.description;if(!parsed.description)p.hidden=true;
      const photo=document.createElement('span');photo.className='service-card__photo';photo.setAttribute('aria-hidden','true');photo.innerHTML=`<img src="${parsed.image}" alt="">`;
      const icon=card.querySelector('.service-card__icon');icon?.before(photo);
    });
  }

  function initServicePhotoFeature(){
    const isAdmin=location.pathname.includes('/admin');
    if(isAdmin){injectAdminStyle();enhanceServiceForm();const target=document.getElementById('content')||document.body;new MutationObserver(enhanceServiceForm).observe(target,{childList:true,subtree:true});}
    else{decoratePublicServices();const target=document.getElementById('services')||document.body;new MutationObserver(decoratePublicServices).observe(target,{childList:true,subtree:true});}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initServicePhotoFeature,{once:true});else initServicePhotoFeature();
})();

(function(){
  const sources=['assets/trabalhos/unhas-naturais-01.jpg?v=20260901-2','assets/trabalhos/unhas-naturais-02.jpg?v=20260901-2','assets/trabalhos/fibra-vidro.jpg?v=20260901-2','assets/trabalhos/pedicure-01.jpg?v=20260901-2','assets/trabalhos/pedicure-02.jpg?v=20260901-2','assets/trabalhos/pedicure-03.jpg?v=20260901-2'];
  const alts=['Unhas naturais claras realizadas no Espaço I.R','Francesinha delicada realizada no Espaço I.R','Alongamento em fibra de vidro rosa realizado no Espaço I.R','Spa dos Pés realizado no Espaço I.R','Pedicure tradicional realizada no Espaço I.R','Detalhes de pedicure realizados no Espaço I.R'];
  function improveGallery(){const cards=[...document.querySelectorAll('.work-grid .work-card')];cards.forEach((card,i)=>{const img=card.querySelector('img');if(!img||!sources[i])return;img.src=sources[i];img.alt=alts[i]||img.alt;img.decoding='async';img.loading=i<3?'eager':'lazy';img.onerror=()=>card.remove()});const third=document.querySelector('.work-grid .work-card:nth-child(3) .work-card__caption');if(third)third.innerHTML='<span>✦</span>Fibra de Vidro';}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',improveGallery,{once:true});else improveGallery();
})();