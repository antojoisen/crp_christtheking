const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clean=v=>String(v??"").replace(/<[^>]*>/g,"").replace(/&nbsp;/g," ").trim();
function safeOrdoHtml(source){
 const t=document.createElement("template");t.innerHTML=String(source||"");
 const allowed=new Set(["H4","P","DIV","SPAN","I","EM","STRONG","B","BR"]);
 const walker=document.createTreeWalker(t.content,NodeFilter.SHOW_ELEMENT),nodes=[];
 while(walker.nextNode())nodes.push(walker.currentNode);
 for(const el of nodes){
  if(!allowed.has(el.tagName)){el.replaceWith(document.createTextNode(el.textContent||""));continue;}
  for(const a of [...el.attributes]){
   if(a.name==="class"){if(!/^[a-zA-Z0-9 _-]{1,100}$/.test(a.value))el.removeAttribute(a.name);}
   else if(a.name==="style"&&/^text-align:\\s*(center|left|right);?$/i.test(a.value)){}
   else el.removeAttribute(a.name);
  }
 }
 return t.innerHTML;
}
const labels={introit:"Introit",oratio:"Collect",epistola:"Epistle",lectio1:"Lesson",graduale:"Gradual",alleluia:"Alleluia",evangelia:"Gospel",offertorium:"Offertory",secreta:"Secret",praefatio:"Preface",communio:"Communion",postcommunio:"Postcommunion"};
function findMassItems(data){
 if(typeof data==="string"){try{data=JSON.parse(data)}catch{return {}}}
 const candidates=[data?.day?.texts?.missa?.items,data?.texts?.missa?.items,data?.day?.texts?.items,data?.texts?.items,data?.missa?.items,data?.items];
 for(const c of candidates)if(c&&typeof c==="object"&&Object.values(c).some(v=>typeof v==="string"&&v.trim()))return c;
 const seen=new Set(),stack=[data];
 while(stack.length){const x=stack.pop();if(!x||typeof x!=="object"||seen.has(x))continue;seen.add(x);
  if(["introit","oratio","epistola","graduale","alleluia","evangelia","offertorium","secreta","communio","postcommunio","praefatio"].some(k=>typeof x[k]==="string"))return x;
  for(const v of Object.values(x))if(v&&typeof v==="object")stack.push(v);
 }
 return {};
}
function renderLanguage(lang,item){
 const box=$("texts-"+lang);if(!item){box.innerHTML="<p>Mass Propers for today are not yet available in this language.</p>";return;}
 const missa=findMassItems(item.data);let html="";
 for(const [key,label] of Object.entries(labels)){const raw=missa[key];if(raw)html+='<article class="proper-item"><h3>'+esc(label)+'</h3>'+safeOrdoHtml(raw)+'</article>';}
 for(const [key,raw] of Object.entries(missa)){if(!labels[key]&&typeof raw==="string"&&raw.trim())html+='<article class="proper-item"><h3>'+esc(key)+'</h3>'+safeOrdoHtml(raw)+'</article>';}
 box.innerHTML=html||'<p>Mass texts are not available in the cached record for this language.</p>';
 if(item.missing?.length){const missing=item.missing.map(x=>typeof x==="string"?x.startsWith("missa/")?x.slice(6).replaceAll("/"," · "):x:String(x));box.insertAdjacentHTML("beforeend",'<p class="proper-note">Unavailable in this language: '+esc(missing.join(", "))+'</p>');}
}
async function load(){
 $("feast-status").textContent="Loading today’s liturgical celebration and Mass Propers…";
 try{
  const r=await fetch("../api/public?kind=feast",{cache:"no-store"}),d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to load today’s feast.");
  const en=d.calendar?.en?.day||d.calendar?.en,la=d.calendar?.la?.day||d.calendar?.la;
  const override=(lang)=>d.overrides?.find(o=>o.field_key==="celebration.name"&&(o.language===lang||o.language==="both"))?.value;
  const name=override("en")||override("la")||en?.celebration?.name||la?.celebration?.name||"Liturgical celebration",date=new Date(d.date+"T12:00:00");
  $("feast-date").textContent=date.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).toUpperCase();
  $("feast-title").textContent=clean(name);
  const rank=en?.celebration?.rank||la?.celebration?.rank,color=en?.celebration?.color||la?.celebration?.color;
  $("feast-meta").textContent="Roman Missal of 1962 · Universal Ordo"+(rank?" · Class "+rank:"")+(color?" · "+color:"");
  $("feast-summary").textContent="The Mass Propers appointed for today, presented in English and Latin.";
  renderLanguage("en",d.propers?.en);renderLanguage("la",d.propers?.la);
  $("feast-status").textContent="Today’s liturgical texts";
 }catch(e){$("feast-status").textContent=e.message;}
}
document.querySelectorAll("[data-lang]").forEach(b=>b.addEventListener("click",()=>{
 document.querySelectorAll("[data-lang]").forEach(x=>x.classList.toggle("active",x===b));
 $("texts-en").hidden=b.dataset.lang!=="en";$("texts-la").hidden=b.dataset.lang!=="la";
}));
load();