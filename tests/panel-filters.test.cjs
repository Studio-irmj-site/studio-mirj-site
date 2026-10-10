const test=require('node:test');
const assert=require('node:assert/strict');
const {appointments,attendances}=require('../admin/panel-filters.js');
const now=new Date(2026,9,10,12);
const rows=[
 {id:'past',appointment_at:new Date(2026,9,9,10).toISOString(),professional:'raquel',status:'confirmado'},
 {id:'today',appointment_at:new Date(2026,9,10,10).toISOString(),professional:'raquel',status:'agendado'},
 {id:'future',appointment_at:new Date(2026,9,11,10).toISOString(),professional:'iarytsa',status:'confirmado'},
 {id:'shared',appointment_at:new Date(2026,9,10,11).toISOString(),professional:null,status:'confirmado'},
 {id:'done',appointment_at:new Date(2026,9,10,12).toISOString(),professional:'raquel',status:'concluido'},
 {id:'cancel',appointment_at:new Date(2026,9,10,13).toISOString(),professional:'iarytsa',status:'cancelado'}
];
test('próximos em aberto exclui passado e serviços encerrados',()=>{
 assert.deepEqual(appointments(rows,{period:'upcoming',status:'active'},now).map(r=>r.id),['today','future','shared']);
});
test('agenda individual inclui reservas compartilhadas que ocupam ambas',()=>{
 assert.deepEqual(appointments(rows,{period:'today',professional:'raquel',status:'active'},now).map(r=>r.id),['today','shared']);
});
test('data específica permite consultar passado e histórico completo',()=>{
 assert.deepEqual(appointments(rows,{date:'2026-10-09',period:'upcoming',status:'all'},now).map(r=>r.id),['past']);
 assert.equal(appointments(rows,{period:'all',status:'all'},now).length,6);
});
test('filtros de concluídos, cancelados e compartilhados permanecem acessíveis',()=>{
 for(const [status,id] of [['concluido','done'],['cancelado','cancel']])assert.deepEqual(appointments(rows,{status},now).map(r=>r.id),[id]);
 assert.deepEqual(appointments(rows,{professional:'shared'},now).map(r=>r.id),['shared']);
});
test('histórico de realizados combina busca e período sem alterar registros',()=>{
 const data=[{client_name:'Raquel Silva',attended_at:new Date(2026,9,10,10).toISOString()},{client_name:'Ana',attended_at:new Date(2026,8,10,10).toISOString()}];
 assert.equal(attendances(data,{period:'month',search:'  RAQUEL '},now).length,1);
 assert.equal(attendances(data,{period:'today',search:'ana'},now).length,0);
 assert.equal(attendances(data,{period:'all'},now).length,2);
 assert.equal(data.length,2);
});
