// n8n Code node: original headlines only; never fabricate dates or translations.
const seen=new Set();
return $input.all().flatMap(({json:item})=>{
 let url;try{url=new URL(item.link);}catch{return [];}
 if(url.protocol!=='https:'||url.hostname!=='web.dev'||!url.pathname.startsWith('/blog/')||url.username||url.password)return [];
 url.search='';url.hash='';
 const title=String(item.title||'').replace(/<[^>]*>/g,'').trim().slice(0,300);
 const date=new Date(item.isoDate||item.pubDate||'');
 if(!title||!Number.isFinite(date.getTime())||date.getTime()>Date.now()+86400000||seen.has(url.href))return [];
 seen.add(url.href);
 return [{json:{url:url.href,title,description:String(item.contentSnippet||item.description||'').replace(/<[^>]*>/g,'').slice(0,600),source:'web.dev',published_at:date.toISOString(),fetched_at:new Date().toISOString()}}];
});
