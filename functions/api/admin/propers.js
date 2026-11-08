import { json, getSession } from "../../_lib/auth.js";

export async function onRequestGet({request,env}) {
  const session=await getSession(request,env);
  if(!session)return json({error:"Please sign in to view cached Mass Propers."},401);
  const date=new URL(request.url).searchParams.get("date")||"";
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return json({error:"Choose a valid date."},400);
  try {
    const result=await env.CHRISTTHEKING_DB.prepare(
      "SELECT language,raw_texts_json,synced_at,missing_json FROM mass_propers WHERE liturgical_date=? ORDER BY language"
    ).bind(date).all();
    const items={};
    for(const row of (result.results||[]))items[row.language]={
      data:JSON.parse(row.raw_texts_json),
      syncedAt:row.synced_at,
      missing:JSON.parse(row.missing_json||"[]")
    };
    return json({date,items,available:Object.keys(items)});
  } catch(error) {
    console.error("Admin Mass Propers preview failed",error);
    return json({error:"Cached Mass Propers could not be loaded."},500);
  }
}
