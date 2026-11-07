import { json, getSession, requireCsrf, sameOrigin } from "../../_lib/auth.js";

const ORDO="https://ordo.fsspx.org/api/v1/calendar";
function dateParts(date){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date||"");return m?{year:Number(m[1]),month:Number(m[2]),day:Number(m[3])}:null;}
async function fetchTexts(date,lang){
  const p=dateParts(date);if(!p)throw new Error("Invalid date "+date);
  const url=ORDO+"/"+p.year+"/"+p.month+"/"+p.day+"/texts?lang="+lang+"&congregation=fsspx";
  let lastError;
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const response=await fetch(url,{headers:{"Accept":"application/json","User-Agent":"ChristTheKingChurchCalendar/1.0"}});
      if(response.ok)return await response.json();
      lastError=new Error("Ordo texts returned HTTP "+response.status+" for "+date+" ("+lang+")");
      if(response.status<500&&response.status!==429)break;
    }catch(error){lastError=error;}
    if(attempt<3)await new Promise(resolve=>setTimeout(resolve,350*attempt));
  }
  throw lastError||new Error("Ordo texts request failed for "+date+" ("+lang+")");
}
export async function onRequestPost({request,env}){
  if(!sameOrigin(request))return json({error:"Request origin rejected."},403);
  const session=await getSession(request,env);
  if(!session||!(await requireCsrf(request,session)))return json({error:"Your session or security token has expired. Please sign in again."},403);
  let body={};try{body=await request.json();}catch{}
  const year=Number(body.year),month=Number(body.month);
  if(!Number.isInteger(year)||year<1900||year>2200||!Number.isInteger(month)||month<1||month>12)return json({error:"Choose a valid year and month."},400);
  const start=new Date(Date.UTC(year,month-1,1)),end=new Date(Date.UTC(year,month,1));
  const dates=[];for(let d=new Date(start);d<end;d.setUTCDate(d.getUTCDate()+1))dates.push(d.toISOString().slice(0,10));
  const started=new Date().toISOString();let completed=0,failures=[];
  try{
    for(let i=0;i<dates.length;i+=6){
      const batch=dates.slice(i,i+6);
      const results=await Promise.all(batch.flatMap(date=>["en","la"].map(async lang=>{
        try{return {date,lang,data:await fetchTexts(date,lang)};}
        catch(error){return {date,lang,error:String(error?.message||error)};}
      })));
      const now=new Date().toISOString(),stmts=[];
      for(const item of results){
        if(item.error){failures.push({date:item.date,language:item.lang,error:item.error});continue;}
        const missing=item.data?.missing??[];
        stmts.push(env.CHRISTTHEKING_DB.prepare("INSERT INTO mass_propers (liturgical_date,language,raw_texts_json,synced_at,missing_json) VALUES (?,?,?,?,?) ON CONFLICT(liturgical_date,language) DO UPDATE SET raw_texts_json=excluded.raw_texts_json,synced_at=excluded.synced_at,missing_json=excluded.missing_json").bind(item.date,item.lang,JSON.stringify(item.data),now,JSON.stringify(missing)));
        completed++;
      }
      if(stmts.length)await env.CHRISTTHEKING_DB.batch(stmts);
    }
    const now=new Date().toISOString();
    await env.CHRISTTHEKING_DB.prepare("INSERT INTO audit_logs (actor,action,entity_type,entity_id,after_json,created_at) VALUES (?,'sync','mass_propers',?,?,?)").bind(session.username,year+"-"+String(month).padStart(2,"0"),JSON.stringify({languages:["en","la"],records:completed,failures:failures.length}),now).run();
    return json({success:failures.length===0,year,month,records:completed,dates:dates.length,failures:failures.slice(0,12),syncedAt:now});
  }catch(error){console.error("Mass propers sync failed",error);return json({error:"Mass Propers sync failed: "+String(error?.message||error).slice(0,180),completed},502);}
}