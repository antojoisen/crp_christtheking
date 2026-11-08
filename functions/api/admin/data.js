import { json, getSession, requireCsrf, sameOrigin } from "../../_lib/auth.js";

async function admin(request, env) {
  if (!sameOrigin(request)) return null;
  const session = await getSession(request, env);
  if (!session || !(await requireCsrf(request, session))) return null;
  return session;
}

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "Please sign in again." }, 401);
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") || "calendar";
  try {
    if (kind === "calendar") {
      const year = Number(url.searchParams.get("year"));
      const month = Number(url.searchParams.get("month"));
      if (!Number.isInteger(year) || year < 1900 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) return json({error:"Choose a valid year and month."},400);
      const start = year + "-" + String(month).padStart(2,"0") + "-01";
      const endDate = new Date(Date.UTC(year, month, 1));
      const end = endDate.toISOString().slice(0,10);
      const result = await env.CHRISTTHEKING_DB.prepare("SELECT liturgical_date, raw_ordo_json, synced_at FROM liturgical_days WHERE liturgical_date >= ? AND liturgical_date < ? ORDER BY liturgical_date").bind(start,end).all();
      const dates=(result.results || []).map(row => row.liturgical_date);
      let overrides=[];
      if(dates.length) {
        const ov=await env.CHRISTTHEKING_DB.prepare("SELECT liturgical_date,field_key,language,value,reason,updated_at FROM admin_overrides WHERE liturgical_date >= ? AND liturgical_date < ?").bind(start,end).all();
        overrides=ov.results||[];
      }
      const grouped={};
      for(const item of overrides) (grouped[item.liturgical_date] ||= []).push(item);
      return json({ days: (result.results || []).map(row => ({ date: row.liturgical_date, data: JSON.parse(row.raw_ordo_json), overrides: grouped[row.liturgical_date]||[], syncedAt: row.synced_at })), count: result.results?.length || 0 });
    }
    if (kind === "announcements") {
      const result = await env.CHRISTTHEKING_DB.prepare("SELECT * FROM announcements ORDER BY starts_on DESC, id DESC").all();
      return json({items:result.results || []});
    }
    if (kind === "schedules") {
      const result = await env.CHRISTTHEKING_DB.prepare("SELECT * FROM mass_schedules ORDER BY sort_order, weekday, specific_date, id").all();
      return json({items:result.results || []});
    }
    if (kind === "audit") {
      const result=await env.CHRISTTHEKING_DB.prepare("SELECT id,actor,action,entity_type,entity_id,created_at FROM audit_logs ORDER BY id DESC LIMIT 100").all();
      return json({items:result.results||[]});
    }
    if (kind === "sync") {
      const result=await env.CHRISTTHEKING_DB.prepare("SELECT id,started_at,finished_at,status,records_fetched,error_message FROM sync_logs ORDER BY id DESC LIMIT 30").all();
      return json({items:result.results||[]});
    }
    if (kind === "overrides") {
      const date = url.searchParams.get("date");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return json({error:"A valid date is required."},400);
      const result = await env.CHRISTTHEKING_DB.prepare("SELECT * FROM admin_overrides WHERE liturgical_date=? ORDER BY field_key, language").bind(date).all();
      return json({items:result.results || []});
    }
    return json({error:"Unknown data type."},400);
  } catch (error) {
    console.error("Admin data read failed", error);
    return json({error:"Could not load the requested data."},500);
  }
}

export async function onRequestPost({ request, env }) {
  const session = await admin(request, env);
  if (!session) return json({error:"Your session or security token has expired. Please sign in again."},403);
  let body;
  try { body = await request.json(); } catch { return json({error:"Invalid request body."},400); }
  const now = new Date().toISOString();
  try {
    if (body.kind === "announcement") {
      const titleEn = String(body.title_en || "").trim();
      if (!titleEn) return json({error:"English title is required."},400);
      const values = [titleEn, String(body.title_la||""), String(body.body_en||""), String(body.body_la||""), body.starts_on || null, body.ends_on || null, body.published ? 1 : 0, now];
      let result;
      if (body.id) result = await env.CHRISTTHEKING_DB.prepare("UPDATE announcements SET title_en=?, title_la=?, body_en=?, body_la=?, starts_on=?, ends_on=?, published=?, updated_at=? WHERE id=?").bind(...values, Number(body.id)).run();
      else result = await env.CHRISTTHEKING_DB.prepare("INSERT INTO announcements (title_en,title_la,body_en,body_la,starts_on,ends_on,published,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(...values.slice(0,7),now,now).run();
      await env.CHRISTTHEKING_DB.prepare("INSERT INTO audit_logs (actor,action,entity_type,entity_id,after_json,created_at) VALUES (?,'save','announcement',?,?,?)").bind(session.username,body.id?String(body.id):String(result.meta?.last_row_id||""),JSON.stringify(body),now).run();
      return json({success:true,id:body.id || result.meta?.last_row_id});
    }
    if (body.kind === "schedule") {
      const title = String(body.title_en||"").trim();
      if (!title) return json({error:"Schedule title is required."},400);
      const values=[title,String(body.title_la||""),String(body.details_en||""),String(body.details_la||""),body.weekday===""||body.weekday==null?null:Number(body.weekday),body.specific_date||null,body.start_time||null,body.active===false?0:1,Number(body.sort_order)||0];
      let result;
      if(body.id) result=await env.CHRISTTHEKING_DB.prepare("UPDATE mass_schedules SET title_en=?,title_la=?,details_en=?,details_la=?,weekday=?,specific_date=?,start_time=?,active=?,sort_order=? WHERE id=?").bind(...values,Number(body.id)).run();
      else result=await env.CHRISTTHEKING_DB.prepare("INSERT INTO mass_schedules (title_en,title_la,details_en,details_la,weekday,specific_date,start_time,active,sort_order) VALUES (?,?,?,?,?,?,?,?,?)").bind(...values).run();
      await env.CHRISTTHEKING_DB.prepare("INSERT INTO audit_logs (actor,action,entity_type,entity_id,after_json,created_at) VALUES (?,'save','mass_schedule',?,?,?)").bind(session.username,String(body.id||result.meta?.last_row_id||""),JSON.stringify(body),now).run();
      return json({success:true,id:body.id||result.meta?.last_row_id});
    }
    if (body.kind === "override") {
      if(!/^\d{4}-\d{2}-\d{2}$/.test(body.date||"") || !String(body.field_key||"").trim() || !String(body.value||"").trim()) return json({error:"Date, field and value are required."},400);
      const lang=["en","la","both"].includes(body.language)?body.language:"both";
      await env.CHRISTTHEKING_DB.prepare("INSERT INTO admin_overrides (liturgical_date,field_key,language,value,reason,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(liturgical_date,field_key,language) DO UPDATE SET value=excluded.value,reason=excluded.reason,updated_at=excluded.updated_at").bind(body.date,String(body.field_key),lang,String(body.value),String(body.reason||""),now).run();
      await env.CHRISTTHEKING_DB.prepare("INSERT INTO audit_logs (actor,action,entity_type,entity_id,after_json,created_at) VALUES (?,'override','liturgical_day',?,?,?)").bind(session.username,body.date,JSON.stringify(body),now).run();
      return json({success:true});
    }
    return json({error:"Unknown save operation."},400);
  } catch(error) {
    console.error("Admin data save failed",error);
    return json({error:"The change could not be saved. Please check the fields and try again."},500);
  }
}

export async function onRequestDelete({ request, env }) {
  const session = await admin(request, env);
  if (!session) return json({error:"Your session or security token has expired."},403);
  const url=new URL(request.url), kind=url.searchParams.get("kind"), id=Number(url.searchParams.get("id"));
  if(!Number.isInteger(id)||id<1||!["announcement","schedule"].includes(kind)) return json({error:"Invalid delete request."},400);
  const table=kind==="announcement"?"announcements":"mass_schedules";
  try {
    await env.CHRISTTHEKING_DB.prepare("DELETE FROM "+table+" WHERE id=?").bind(id).run();
    await env.CHRISTTHEKING_DB.prepare("INSERT INTO audit_logs (actor,action,entity_type,entity_id,created_at) VALUES (?,'delete',?,?,?)").bind(session.username,table,String(id),new Date().toISOString()).run();
    return json({success:true});
  } catch(error) { console.error("Admin delete failed",error); return json({error:"Could not delete this item."},500); }
}
