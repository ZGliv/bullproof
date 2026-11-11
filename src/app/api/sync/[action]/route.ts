export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{action:string}>}){
 const {action}=await params;if(!['create','join','recover','pair','exchange'].includes(action))return Response.json({error:'Not found'},{status:404});
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 try{const base=process.env.BULLPROOF_RUNNER_URL;if(!base)throw Error();const url=new URL('/sync/'+action,base);if(url.protocol!=='https:'||!url.hostname.endsWith('.workers.dev'))throw Error();const body=await request.text();if(body.length>300000)return Response.json({error:'Batch too large'},{status:413});const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:request.headers.get('authorization')??''},body,cache:'no-store',signal:AbortSignal.timeout(15000)});return new Response(await r.text(),{status:r.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}catch{return Response.json({error:'Sync unavailable. Local changes retained.'},{status:503});}
}
