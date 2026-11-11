import fallback from '../../../../public/data/paper-arena.json';
export const dynamic='force-dynamic';
export async function GET(){
 const configured=process.env.BULLPROOF_RUNNER_URL;
 if(!configured)return Response.json(fallback,{headers:{'Cache-Control':'no-store'}});
 try{
  const url=new URL(configured);
  if(url.protocol!=='https:'||!url.hostname.endsWith('.workers.dev')||url.username||url.password)throw new Error('Invalid runner address');
  for(let attempt=0;attempt<2;attempt++){
   try{
    const response=await fetch(new URL('/snapshot',url),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(6000)});
    if(!response.ok)throw new Error('Hosted runner unavailable');
    return Response.json(await response.json(),{headers:{'Cache-Control':'no-store'}});
   }catch(error){if(attempt===1)throw error;}
  }
  throw new Error('Hosted runner unavailable');
 }catch{return Response.json({error:'The hosted portfolio feed is temporarily unavailable. Your recorded history is retained; retry shortly.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
