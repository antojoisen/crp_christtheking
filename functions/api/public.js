import { json } from "../_lib/auth.js";

export async function onRequestGet({request,env}) {
  const url=new URL(request.url);
  const kind=url.searchParams.get("kind")||"calendar";
  try {
    if(kind==="content") {
      const today=new Date().toISOString().slice(0,10);
      const [ann,schedules]=await Promise.all([
        env.CHRISTTHEKING_DB.prepare("SELECT id,title_en,title_la,body_en,body_la,starts_on,ends_on FROM announcements WHERE published=1 AND (starts_on IS NULL OR starts_on<=?) AND (ends_on IS NULL OR ends_on>=?) ORDER BY starts_on,id DESC").bind(today,today).all(),
        env.CHRISTTHEKING_DB.prepare("SELECT id,title_en,title_la,details_en,details_la,weekday,specific_date,start_time,sort_order FROM mass_schedules WHERE active=1 ORDER BY sort_order,weekday,specific_date,id").all()
      ]);
      return json({announcements:ann.results||[],schedules:schedules.results||[]});
    }
    if(kind==="calendar") {
      const now=new Date();
      const year=Number(url.searchParams.get("year")||now.getFullYear());
      const month=Number(url.searchParams.get("month")||now.getMonth()+1);
      if(!Number.isInteger(year)||year<1900||year>2200||!Number.isInteger(month)||month<1||month>12) return json({error:"Invalid month."},400);
      const start=year+"-"+String(month).padStart(2,"0")+"-01";
      const end=new Date(Date.UTC(year,month,1)).toISOString().slice(0,10);
      const result=await env.CHRISTTHEKING_DB.prepare("SELECT liturgical_date,raw_ordo_json,synced_at FROM liturgical_days WHERE liturgical_date>=? AND liturgical_date<? ORDER BY liturgical_date").bind(start,end).all();
      return json({days:(result.results||[]).map(r=>({date:r.liturgical_date,data:JSON.parse(r.raw_ordo_json)})),count:result.results?.length||0});
    }
    return json({error:"Unknown request."},400);
  } catch(error) {
    console.error("Public content read failed",error);
    return json({error:"Content is temporarily unavailable."},500);
  }
}
