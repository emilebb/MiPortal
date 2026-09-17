// Prefer the persisted n8n collection. The existing RSS remains a fallback.
window.MiPortalNewsCache = async () => {
 const client=window.MiPortalSupabase; if(!client)return null;
 try {
  const {data,error}=await client.from('news_articles')
   .select('title,description,url,source,published_at,fetched_at')
   .eq('published',true).order('published_at',{ascending:false}).limit(100)
   .abortSignal(AbortSignal.timeout(5000));
  if(error||!data?.length)return null;
  return {status:'ok',items:data.map(row=>({title:row.title,description:row.description,link:row.url,pubDate:row.published_at}))};
 }catch{return null;}
};
