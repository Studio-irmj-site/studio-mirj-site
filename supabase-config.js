window.SUPABASE_CONFIG={url:"https://ihaizgqpeqnhztofqkar.supabase.co",anonKey:"sb_publishable_9A6K6mA2LD3Z-D3au0S85A_wFHKbhWv"};

(function(){
  const sources=[
    'assets/trabalhos/unhas-naturais-01.jpg?v=20260901-3',
    'assets/trabalhos/unhas-naturais-02.jpg?v=20260901-3',
    'assets/trabalhos/fibra-vidro.jpg?v=20260901-3',
    'assets/trabalhos/pedicure-01.jpg?v=20260901-3',
    'assets/trabalhos/pedicure-02.jpg?v=20260901-3',
    'assets/trabalhos/pedicure-03.jpg?v=20260901-3'
  ];
  const alts=[
    'Unhas naturais realizadas no Espaço I.R',
    'Francesinha delicada realizada no Espaço I.R',
    'Alongamento em fibra de vidro rosa realizado no Espaço I.R',
    'Spa dos Pés realizado no Espaço I.R',
    'Pedicure tradicional realizada no Espaço I.R',
    'Detalhes de pedicure realizados no Espaço I.R'
  ];

  function removeBrokenCard(img){
    const card=img.closest('.work-card');
    if(card) card.remove();
  }

  function improveGallery(){
    const imgs=[...document.querySelectorAll('.work-grid .work-card img')];
    imgs.forEach((img,i)=>{
      if(!sources[i]) return;
      img.alt=alts[i]||img.alt;
      img.decoding='async';
      img.loading=i<3?'eager':'lazy';
      img.style.imageRendering='auto';
      img.addEventListener('error',()=>removeBrokenCard(img),{once:true});
      img.src=sources[i];
      if(img.complete && img.naturalWidth===0) removeBrokenCard(img);
    });

    const cards=[...document.querySelectorAll('.work-grid .work-card')];
    if(cards[2]){
      const third=cards[2].querySelector('.work-card__caption');
      if(third) third.innerHTML='<span>✦</span>Fibra de Vidro';
    }

    if(!document.getElementById('ir-gallery-quality')){
      const style=document.createElement('style');
      style.id='ir-gallery-quality';
      style.textContent=`
        .work-grid{gap:12px!important;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))!important}
        .work-card{border-radius:20px!important;background:#fff!important;box-shadow:0 10px 28px rgba(63,21,42,.10)!important;transform:translateZ(0)}
        .work-card__media{height:292px!important;background:linear-gradient(145deg,#f8f3f7,#eee6ec)!important;position:relative!important;overflow:hidden!important}
        .work-card img{width:100%!important;height:100%!important;object-fit:cover!important;object-position:center!important;filter:contrast(1.035) saturate(1.045) brightness(1.01)!important;transform:translateZ(0)!important;backface-visibility:hidden!important}
        .work-card:hover img{transform:scale(1.018) translateZ(0)!important}
        .work-card__caption{min-height:56px!important;font-size:13px!important}
        @media(max-width:1050px){.work-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}.work-card__media{height:315px!important}}
        @media(max-width:780px){.work-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.work-card__media{height:285px!important}}
        @media(max-width:480px){.work-grid{gap:9px!important;grid-template-columns:repeat(2,minmax(0,1fr))!important}.work-card__media{height:225px!important}.work-card__caption{font-size:11px!important}}
      `;
      document.head.appendChild(style);
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',improveGallery,{once:true});
  else improveGallery();
})();