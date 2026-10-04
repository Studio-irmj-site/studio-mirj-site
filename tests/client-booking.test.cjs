const {test} = require('node:test');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright');
const path = require('node:path');
const fixtures = [
 {available_date:'2026-10-10',available_time:'09:00:00',professional:'raquel'},
 {available_date:'2026-10-10',available_time:'09:00:00',professional:'iarytsa'},
 {available_date:'2026-10-10',available_time:'10:00:00',professional:'iarytsa'},
];
let browser;
test.before(async()=>{browser=await chromium.launch({headless:true,args:['--no-sandbox']});});
test.after(async()=>{await browser?.close();});
async function setup({slots=fixtures,conflict=false}={}) {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.setContent(`<button id="ctaButton">Agendar</button><article class="service-card" aria-pressed="true" data-service-id="service-test"><div class="service-card__copy"><strong>Manicure</strong></div><div class="service-card__price"><strong>R$ 50,00</strong></div></article>`);
 await page.evaluate(({slots,conflict})=>{
  window.SUPABASE_CONFIG={url:'https://test.invalid',anonKey:'test'};
  window.StudioCustomerAccount={requireLogin:async()=>true,getCachedProfile:()=>null};
  window.StudioCustomerAppointments={register:async args=>{window.bookingCalls.push(args);if(conflict)throw new Error('Esse horário acabou de ser reservado.');return 'appointment-test';},showReceipt(){}};
  window.bookingCalls=[];window.opened=[];
  window.open=url=>{window.opened.push(url);return {};};
  window.fetch=async(url,options)=>{
   if(url.endsWith('get_professional_available_slots'))return {ok:true,json:async()=>slots};
   window.bookingCalls.push(JSON.parse(options.body));
   return {ok:!conflict,json:async()=> 'appointment-test',text:async()=> 'HORARIO_INDISPONIVEL'};
  };
 },{slots,conflict});
 await page.addScriptTag({path:path.resolve(__dirname,'../professionals.js')});
 await page.addScriptTag({path:path.resolve(__dirname,'../quote-register.js')});
 await page.click('#ctaButton');
 await page.fill('#requestName','Cliente de teste');await page.fill('#requestPhone','11999999999');
 return page;
}
test('Sem preferência deduplicates times, reviews before booking, submits displayed professional',async()=>{
 const page=await setup();
 try{
 await page.selectOption('#requestProfessional','any');await page.selectOption('#requestDate','2026-10-10');
 assert.equal(await page.locator('#requestTime option').count(),3);
 await page.selectOption('#requestTime','10:00');await page.fill('#requestNotes','<img src=x onerror=alert(1)>');
 await page.click('#requestSubmit');
 assert.equal(await page.evaluate(()=>bookingCalls.length),0);
 assert.match(await page.locator('#requestReview').innerText(),/Iarytsa/);
 assert.equal(await page.locator('#requestReview img').count(),0);
 assert.match(await page.locator('#requestReview').innerText(),/aguarde a aprovação/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 await page.screenshot({path:'/workspace/scratch/c8c44eb0e702/ir-client/review-mobile.png',fullPage:true});
 await page.click('#requestSubmit');
 const calls=await page.evaluate(()=>bookingCalls);assert.equal(calls.length,1);assert.equal(calls[0].p_professional,'iarytsa');
 assert.equal(await page.locator('#appointmentRequestModal').count(),0);
 const message=decodeURIComponent(await page.evaluate(()=>opened[0]));assert.match(message,/Aguardando confirmação/);
 }finally{await page.close();}
});
test('Specific professional filters times and back-to-edit resets the review',async()=>{
 const page=await setup();try{
 await page.selectOption('#requestProfessional','raquel');await page.selectOption('#requestDate','2026-10-10');
 assert.equal(await page.locator('#requestTime option').count(),2);
 await page.selectOption('#requestTime','09:00');await page.click('#requestSubmit');await page.click('#requestCancel');
 assert.equal(await page.locator('#requestReview').isVisible(),false);
 await page.selectOption('#requestProfessional','iarytsa');assert.equal(await page.inputValue('#requestDate'),'');assert.equal(await page.inputValue('#requestTime'),'');
 assert.equal(await page.evaluate(()=>bookingCalls.length),0);
 }finally{await page.close();}
});
test('No published slots: WhatsApp consultation is possible without writing a booking',async()=>{
 const page=await setup({slots:[]});try{
 await page.selectOption('#requestProfessional','any');await page.click('#requestSubmit');
 assert.match(await page.locator('#requestReview').innerText(),/sem reserva de horário/);
 await page.click('#requestSubmit');assert.equal(await page.evaluate(()=>bookingCalls.length),0);
 assert.match(decodeURIComponent(await page.evaluate(()=>opened[0])),/sem reserva de horário/);
 }finally{await page.close();}
});
test('Server conflict returns to editing without sending WhatsApp or silently changing professional',async()=>{
 const page=await setup({conflict:true});try{
 await page.selectOption('#requestProfessional','any');await page.selectOption('#requestDate','2026-10-10');await page.selectOption('#requestTime','10:00');
 await page.click('#requestSubmit');await page.click('#requestSubmit');
 assert.match(await page.locator('#requestError').innerText(),/acabou de ser reservado/);
 assert.equal(await page.locator('.request-grid').isVisible(),true);
 assert.equal(await page.evaluate(()=>opened.length),0);assert.equal(await page.evaluate(()=>bookingCalls.length),1);
 }finally{await page.close();}
});
test('Date without time does not proceed to review',async()=>{
 const page=await setup();try{
 await page.selectOption('#requestProfessional','raquel');await page.selectOption('#requestDate','2026-10-10');await page.click('#requestSubmit');
 assert.match(await page.locator('#requestError').innerText(),/Escolha data e horário juntos/);
 assert.equal(await page.locator('#requestReview').isVisible(),false);
 }finally{await page.close();}
});
