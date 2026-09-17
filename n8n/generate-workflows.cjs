const fs=require('node:fs'); const {randomUUID}=require('node:crypto');
const base='https://lfflmyqjoxntoatbbwtf.supabase.co/rest/v1';
const node=(name,type,parameters,x,version=1)=>({id:randomUUID(),name,type:`n8n-nodes-base.${type}`,typeVersion:version,position:[x,300],parameters});
const trigger=(name,field,count)=>node(name,'scheduleTrigger',{rule:{interval:[{field,[field==='hours'?'hoursInterval':'minutesInterval']:count}]}},0,1.2);
const http=(name,path,body,x)=>node(name,'httpRequest',{method:'POST',url:base+path,authentication:'predefinedCredentialType',nodeCredentialType:'supabaseApi',sendBody:true,specifyBody:'json',jsonBody:body,options:{timeout:20000}},x,4.2);
const workflow=(name,nodes)=>({id:randomUUID().replaceAll('-','').slice(0,16),name,nodes,connections:Object.fromEntries(nodes.slice(0,-1).map((n,i)=>[n.name,{main:[[{node:nodes[i+1].name,type:'main',index:0}]]}])),active:false,settings:{executionOrder:'v1',timezone:'America/Bogota',saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false,executionTimeout:180}});
const normalize=fs.readFileSync(__dirname+'/normalize-news.js','utf8');
const upsert=http('Publicar sin duplicados','/news_articles?on_conflict=url','={{ JSON.stringify($json) }}',660);
upsert.parameters.sendHeaders=true;upsert.parameters.headerParameters={parameters:[{name:'Prefer',value:'resolution=merge-duplicates,return=minimal'}]};
const news=workflow('MiPortal · Noticias web cada 4 horas',[
 trigger('Cada 4 horas','hours',4),node('Leer web.dev','rssFeedRead',{url:'https://web.dev/feed.xml',options:{}},220),node('Validar noticias','code',{jsCode:normalize},440,2),upsert]);
const claim=http('Reclamar mensaje pendiente','/rpc/claim_contact','{}',220);
const mail=node('Avisar por Resend','httpRequest',{method:'POST',url:'https://api.resend.com/emails',authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendHeaders:true,headerParameters:{parameters:[{name:'Idempotency-Key',value:'={{ "miportal-contact/" + $json.id }}'}]},sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify({from:"MiPortal <no-reply@auth.miportal.me>",to:["emile.123455@gmail.com"],subject:"Nuevo mensaje de MiPortal",reply_to:$json.email,text:"Nombre: " + $json.name + "\\nCorreo: " + $json.email + "\\n\\n" + $json.message}) }}',options:{timeout:20000}},440,4.2);
const ack=http('Marcar aviso enviado','/rpc/complete_contact','={{ JSON.stringify({p_id:$("Reclamar mensaje pendiente").item.json.id,p_lease_id:$("Reclamar mensaje pendiente").item.json.lease_id}) }}',660);
const contact=workflow('MiPortal · Avisos de contacto cada 5 minutos',[trigger('Cada 5 minutos','minutes',5),claim,mail,ack]);
for(const [file,w] of [['news.json',news],['contact.json',contact]])fs.writeFileSync(__dirname+'/'+file,JSON.stringify(w,null,2)+'\n');
