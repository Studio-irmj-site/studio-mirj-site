(function(root){'use strict';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function tokenFrom(value){const raw=String(value||'').trim();if(uuid.test(raw))return raw.toLowerCase();try{const url=new URL(raw,'https://studio-irmj-site.github.io/studio-mirj-site/');const token=new URLSearchParams(url.hash.split('?')[1]||'').get('convite');return token&&uuid.test(token)?token.toLowerCase():'';}catch{return '';}}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const linkFor=token=>{if(!uuid.test(token))throw new Error('Link de avaliação inválido.');return 'https://studio-irmj-site.github.io/studio-mirj-site/#avaliacoes?convite='+encodeURIComponent(token);};
const stars=rating=>'★'.repeat(Math.max(0,Math.min(5,Number(rating)||0)))+'☆'.repeat(5-Math.max(0,Math.min(5,Number(rating)||0)));
function message(error){const text=String(error?.message||error||'');if(text.includes('AVALIACAO_JA_ENVIADA'))return 'A avaliação deste atendimento já foi enviada. Obrigada!';if(text.includes('LINK_INVALIDO_OU_EXPIRADO'))return 'Este link não está disponível. Peça um novo link ao Espaço I.R.';if(text.includes('ATENDIMENTO_NAO_CONCLUIDO'))return 'O atendimento precisa estar concluído para gerar a avaliação.';if(text.includes('ACESSO_NEGADO')||text.includes('permission denied'))return 'Entre com uma conta administrativa autorizada.';if(text.includes('AVALIACAO_INVALIDA'))return 'Escolha de 1 a 5 estrelas e escreva até 1.000 caracteres.';return 'Não foi possível concluir agora. Tente novamente.';}
const api={tokenFrom,esc,linkFor,stars,message};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.IRReviews=api;
})(typeof window!=='undefined'?window:globalThis);
