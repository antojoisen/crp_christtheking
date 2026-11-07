import { json, getSession, requireCsrf, sameOrigin } from "../../_lib/auth.js";

export async function onRequestPost({request,env}) {
  if(!sameOrigin(request)) return json({error:"Request origin rejected."},403);
  const session=await getSession(request,env);
  if(!session || !(await requireCsrf(request,session))) return json({error:"Your session or security token has expired. Please sign in again."},403);
  let body={}; try { body=await request.json(); } catch {}
  const year=Number(body.year || new Date().getFullYear());
  if(!Number.isInteger(year)||year<1900||year>2200) return json({error:"Choose a valid calendar year."},400);
  const started=new Date().toISOString();
  let logId;
  try {
    const log=await env.CHRISTTHEKING_DB.prepare("INSERT INTO sync_logs (started_at,status,records_fetched) VALUES (?,'running',0)").bind(started).run();
    logId=log.meta?.last_row_id;
    const base="https://ordo.fsspx.org/api/v1/export/json?year="+year+"&congregation=fsspx&mode=civil";
    const responses=await Promise.all(["en","la"].map(async lang=>{
      const response=await fetch(base+"&lang="+lang,{headers:{"Accept":"application/json","User-Agent":"ChristTheKingChurchCalendar/1.0"}});
      if(!response.ok) throw new Error("Ordo returned HTTP "+response.status+" for "+lang);
      const payload=await response.json();
      if(!payload || !Array.isArray(payload.days) || payload.days.length<350) throw new Error("Ordo returned an unexpected "+lang+" calendar format.");
      return {lang,days:payload.days};
    }));
    const byDate=new Map();
    for(const result of responses) for(const day of result.days) {
      if(!day.date) continue;
      const item=byDate.get(day.date)||{};
      item[result.lang]=day;
      byDate.set(day.date,item);
    }
    const syncedAt=new Date().toISOString();
    const statements=[];
    for(const [date,data] of byDate) {
      statements.push(env.CHRISTTHEKING_DB.prepare("INSERT INTO liturgical_days (liturgical_date,raw_ordo_json,source,language,synced_at) VALUES (?,?,?,?,?) ON CONFLICT(liturgical_date) DO UPDATE SET raw_ordo_json=excluded.raw_ordo_json,source=excluded.source,language=excluded.language,synced_at=excluded.synced_at").bind(date,JSON.stringify(data),"ordo-1962-universal-fsspx","en+la",syncedAt));
    }
    for(let i=0;i<statements.length;i+=50) await env.CHRISTTHEKING_DB.batch(statements.slice(i,i+50));
    await env.CHRISTTHEKING_DB.prepare("UPDATE sync_logs SET finished_at=?,status='success',records_fetched=? WHERE id=?").bind(new Date().toISOString(),byDate.size,logId).run();
    await env.CHRISTTHEKING_DB.prepare("INSERT INTO audit_logs (actor,action,entity_type,entity_id,after_json,created_at) VALUES (?,'sync','liturgical_calendar',?,?,?)").bind(session.username,String(year),JSON.stringify({records:byDate.size,source:"Ordo 1962 universal",languages:["en","la"]}),new Date().toISOString()).run();
    return json({success:true,year,records:byDate.size,languages:["en","la"],syncedAt});
  } catch(error) {
    console.error("Ordo sync failed",error);
    if(logId) await env.CHRISTTHEKING_DB.prepare("UPDATE sync_logs SET finished_at=?,status='error',error_message=? WHERE id=?").bind(new Date().toISOString(),String(error?.message||error).slice(0,500),logId).run();
    return json({error:"Calendar sync failed: "+String(error?.message||error).slice(0,180)},502);
  }
}
