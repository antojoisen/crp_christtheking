(async()=>{
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 try{
  const [content,feast]=await Promise.all([
   fetch("api/public?kind=content",{cache:"no-store"}),
   fetch("api/public?kind=feast",{cache:"no-store"})
  ]);
  if(content.ok){
   const d=await content.json();
   if(Array.isArray(d.schedules)&&d.schedules.length){
    const grid=document.querySelector(".schedule-grid");
    if(grid)grid.innerHTML=d.schedules.map(x=>'<div class="schedule-card"><h3>'+esc(x.title_en)+'</h3>'+String(x.details_en||"").split("\n").filter(Boolean).map(t=>"<p>"+esc(t)+"</p>").join("")+'</div>').join("");
   }
   const specialPanel=document.getElementById("special");
   if(specialPanel){const occasions=Array.isArray(d.specialOccasions)?d.specialOccasions:[];specialPanel.innerHTML=occasions.length?occasions.map(x=>'<div class="schedule-card full-width"><h3>'+esc(x.title_en)+'</h3>'+String(x.details_en||"").split("\n").filter(Boolean).map(t=>"<p>"+esc(t)+"</p>").join("")+(x.starts_on?'<p class="small">'+esc(x.starts_on)+(x.ends_on&&x.ends_on!==x.starts_on?" – "+esc(x.ends_on):"")+"</p>":"")+"</div>").join(""):'<div class="schedule-card full-width"><h3>Upcoming Special Occasions</h3><p>No special occasions scheduled at this moment. Please check back later for updates on feast days, Holy Week schedules, and other special Masses.</p></div>';}
   if(Array.isArray(d.announcements)&&d.announcements.length){
    const box=document.getElementById("public-announcements"),list=document.getElementById("public-announcement-list");
    if(box&&list){list.innerHTML=d.announcements.map(x=>'<article style="margin-bottom:14px"><h4>'+esc(x.title_en)+'</h4><p>'+esc(x.body_en).replace(/\n/g,"<br>")+'</p></article>').join("");box.style.display="block";}
   }
  }
  if(feast.ok){
   const data=await feast.json(),en=data.calendar?.en?.day||data.calendar?.en,la=data.calendar?.la?.day||data.calendar?.la;
   const override=data.overrides?.find(o=>o.field_key==="celebration.name"&&(o.language==="en"||o.language==="both"))?.value;
   const name=override||en?.celebration?.name||la?.celebration?.name||"Liturgical celebration";
   const clean=s=>String(s||"").replace(/<[^>]*>/g,"").replace(/&nbsp;/g," ").trim();
   const date=new Date(data.date+"T12:00:00");
   const dateText=date.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
   const dateEl=document.getElementById("saint-date"),nameEl=document.getElementById("saint-name"),descEl=document.getElementById("saint-desc"),link=document.getElementById("saint-link");
   if(dateEl)dateEl.textContent=dateText;
   if(nameEl)nameEl.textContent=clean(name);
   if(descEl)descEl.textContent=(en?.celebration?.rank?"Class "+en.celebration.rank+" · ":"")+"Read the Mass Propers for today in English and Latin.";
   if(link){link.href="feast-of-the-day/index.html";link.textContent="View Today’s Feast & Mass Propers →";}
  }
 }catch(e){console.warn("Daily liturgical content unavailable",e);}
})();