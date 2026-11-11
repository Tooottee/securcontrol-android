(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const config = window.SECURCONTROL_CONFIG;
  let db = null, profile = null, authUser = null;
  let employeesCache = [];

  const adminNav = [
    ["dashboard","Resumen","▦"],["personal","Personal","♙"],["shifts","Cuadrantes","▦"],
    ["coverage","Cobertura","◫"],["vacations","Vacaciones","▣"],["hours","Control horario","◷"],
    ["payroll","Nóminas","€"],["docs","Documentación","▤"],["material","Material","▣"]
  ];
  const guardNav = [["dashboard","Inicio","▦"],["punches","Fichar","◷"],["my-shifts","Mi cuadrante","▦"],["my-payroll","Mi nómina","€"],["profile","Mi perfil","♙"]];
  const labels = Object.fromEntries([...adminNav,...guardNav].map(x=>[x[0],x[1]]));
  const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const dateText = v => v ? new Date(v).toLocaleString("es-ES",{dateStyle:"short",timeStyle:"short"}) : "—";
  const showLogin = msg => { $("login-view").classList.remove("hidden"); $("app-view").classList.add("hidden"); $("login-error").textContent=msg||""; };
  const showApp = () => { $("login-view").classList.add("hidden"); $("app-view").classList.remove("hidden"); };
  function notify(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),3500);}
  function setContent(html){$("page-content").innerHTML=html;}
  function renderNav(active){
    $("main-nav").replaceChildren();
    (profile.role==="admin"?adminNav:guardNav).forEach(([id,label,icon])=>{
      const b=document.createElement("button");b.type="button";b.className="nav-item"+(id===active?" active":"");
      b.innerHTML='<span aria-hidden="true">'+icon+'</span><b>'+label+'</b>';
      b.addEventListener("click",()=>renderPage(id));$("main-nav").append(b);
    });
  }
  async function getCount(table){
    const {count,error}=await db.from(table).select("id",{count:"exact",head:true});
    return error?"—":(count??0);
  }
  function stat(label,value,sub){return '<article class="stat-card"><span>'+label+'</span><strong>'+value+'</strong><small>'+sub+'</small></article>';}
  async function dashboard(){
    setContent('<div class="welcome"><div><p class="eyebrow">BIENVENIDO/A</p><h2>'+esc(profile.full_name||authUser.email)+'</h2><p>Este es el estado de tu espacio SECURCONTROL.</p></div><span class="welcome-icon">✦</span></div><div id="stats" class="stats-grid"><div class="stat-card">Cargando…</div></div><section class="panel"><div class="panel-head"><div><h3>Panel de control</h3><p>Accesos según tu perfil</p></div><span class="tag">'+(profile.role==="admin"?"ADMINISTRACIÓN":"VIGILANTE")+'</span></div><div class="quick-links" id="quick-links"></div></section>');
    const isAdmin=profile.role==="admin";
    if(isAdmin){
      const vals=await Promise.all(["employees","shifts","vacation_requests","time_punches"].map(getCount));
      $("stats").innerHTML=stat("PERSONAL",vals[0],"Trabajadores registrados")+stat("TURNOS",vals[1],"Turnos registrados")+stat("SOLICITUDES",vals[2],"Vacaciones")+stat("FICHAJES",vals[3],"Registros");
    }else $("stats").innerHTML=stat("CUENTA","Activa","Acceso verificado")+stat("PERFIL","Vigilante","Permisos individuales");
    const links=(isAdmin?adminNav.slice(1):guardNav.slice(1));
    $("quick-links").innerHTML=links.map(([id,l,i])=>'<button class="quick-link" data-page="'+id+'"><span>'+i+'</span>'+l+' <b>→</b></button>').join("");
    $("quick-links").querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>renderPage(b.dataset.page)));
  }
  function moduleHeader(title,desc,buttonText,buttonId){
    return '<section class="panel"><div class="panel-head"><div><h3>'+title+'</h3><p>'+desc+'</p></div><button class="primary" id="'+buttonId+'" type="button">'+buttonText+'</button></div><div id="module-message" class="error" role="status"></div><div id="module-table" class="table-wrap">Cargando datos…</div></section>';
  }
  function renderEmployeeRows(rows){
    if(!rows.length)return '<p class="muted">Todavía no hay trabajadores registrados.</p>';
    return '<table class="data-table"><thead><tr><th>Nombre</th><th>Código</th><th>Jornada</th><th>IRPF</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>'+rows.map(e=>'<tr><td>'+esc(e.full_name)+'</td><td>'+esc(e.employee_code||"—")+'</td><td>'+esc(e.work_percentage??100)+'%</td><td>'+esc(e.irpf??0)+'%</td><td><span class="tag">'+(e.active?"Activo":"Inactivo")+'</span></td><td><button class="secondary small-action" data-toggle="'+esc(e.id)+'" data-active="'+String(!!e.active)+'">'+(e.active?"Desactivar":"Activar")+'</button> '+(!e.user_id?'<button class="secondary small-action" data-create-account="'+esc(e.id)+'">Crear acceso</button> ':"")+'<button class="secondary small-action" data-employee-delete="'+esc(e.id)+'">Eliminar</button></td></tr>').join("")+'</tbody></table>';
  }
  async function loadEmployees(){
    const {data,error}=await db.from("employees").select("*").order("full_name",{ascending:true});
    if(error)throw error;
    employeesCache=data||[];
    $("module-table").innerHTML=renderEmployeeRows(employeesCache);
    $("module-table").querySelectorAll("[data-toggle]").forEach(b=>b.addEventListener("click",async()=>{
      const active=b.dataset.active!=="true";
      const {error}=await db.from("employees").update({active}).eq("id",b.dataset.toggle);
      if(error){notify("No se pudo actualizar el trabajador: "+error.message);return;}
      notify("Estado del trabajador actualizado.");await loadEmployees();
    }));
    $("module-table").querySelectorAll("[data-create-account]").forEach(b=>b.addEventListener("click",async()=>{
      const employee=employeesCache.find(e=>String(e.id)===b.dataset.createAccount);
      if(!employee||employee.user_id)return;
      const email=prompt("Correo electrónico para el acceso:",employee.email||"");
      if(email===null)return;
      const cleanEmail=email.trim().toLowerCase();
      if(!cleanEmail||!cleanEmail.includes("@")){notify("Introduce un correo electrónico válido.");return;}
      const password=prompt("Contraseña provisional (mínimo 6 caracteres). El vigilante deberá cambiarla después:", "");
      if(password===null)return;
      if(password.length<6){notify("La contraseña debe tener al menos 6 caracteres.");return;}
      b.disabled=true;b.textContent="Creando…";
      const {data,error}=await db.functions.invoke("create-employee-account",{body:{employee_id:employee.id,full_name:employee.full_name,email:cleanEmail,temporary_password:password}});
      if(error||!data?.success){
        notify("No se pudo crear el acceso: "+(data?.error||error?.message||"Error desconocido"));
        b.disabled=false;b.textContent="Crear acceso";return;
      }
      notify("Cuenta de acceso creada y vinculada correctamente.");
      await loadEmployees();
    }));
    $("module-table").querySelectorAll("[data-employee-delete]").forEach(b=>b.addEventListener("click",async()=>{
      const employee=employeesCache.find(e=>String(e.id)===b.dataset.employeeDelete);
      if(!employee)return;
      if(employee.user_id){
        notify("Este trabajador tiene una cuenta de acceso vinculada. Desactívalo; no se puede borrar desde aquí para evitar dejar una cuenta huérfana.");
        return;
      }
      if(!confirm("¿Eliminar definitivamente la ficha de "+employee.full_name+"? Esta acción no se puede deshacer. Si tiene turnos, fichajes, vacaciones u otros registros asociados, Supabase impedirá el borrado."))return;
      b.disabled=true;
      const {error}=await db.from("employees").delete().eq("id",employee.id);
      if(error){
        notify("No se pudo eliminar. Puede tener registros asociados (turnos, fichajes, vacaciones o nómina): "+error.message);
        b.disabled=false;
        return;
      }
      notify("Ficha del trabajador eliminada.");
      await loadEmployees();
    }));
  }
  function employeeForm(){
    const box=document.createElement("div");box.className="form-panel";box.id="employee-form-panel";
    box.innerHTML='<form id="employee-form" class="record-form"><h3>Ficha de vigilante</h3><div class="form-grid"><label>Nombre y apellidos<input name="full_name" required maxlength="120"></label><label>DNI / NIE<input name="dni" required maxlength="20"></label><label>TIP<input name="tip" maxlength="40"></label><label>Caducidad TIP<input name="tip_expiry" type="date"></label><label>Teléfono<input name="phone" type="tel" maxlength="30"></label><label>Correo electrónico<input name="email" type="email"></label><label>Puesto<input name="post" list="post-options" placeholder="Ej. VS1"></label><label>Categoría<input name="category" placeholder="Ej. Vigilante de seguridad"></label><label>Servicio / centro<input name="service" placeholder="Ej. Casa Juvenil de Sograndio"></label><label>Usuario<input name="username" maxlength="60"></label><label>Código interno<input name="employee_code" maxlength="40"></label><label>Fecha de alta<input name="start_date" type="date"></label><label>Jornada (%)<input name="work_percentage" type="number" min="1" max="100" step="0.01" value="100" required></label><label>IRPF (%)<input name="irpf" type="number" min="0" max="100" step="0.01" value="2" required></label></div><datalist id="post-options"><option>Puerta</option><option>VS1</option><option>VS2</option><option>VS3</option><option>VS4</option><option>VS5</option><option>VS6</option><option>VS10</option><option>VS11</option><option>VS15</option><option>VS20</option><option>VS30</option><option>VS40</option></datalist><div class="notice"><label><input type="checkbox" name="create_account" id="create-account"> Crear también su cuenta de acceso</label><div id="account-fields" class="form-grid hidden"><label>Contraseña provisional<input name="temporary_password" type="password" minlength="6" autocomplete="new-password"></label><p class="muted">El vigilante deberá cambiar su contraseña tras el primer acceso.</p></div></div><div class="form-actions"><button class="primary" type="submit">Guardar trabajador</button><button class="secondary" type="button" id="cancel-employee">Cancelar</button></div><p class="error" id="employee-error"></p></form>';
    $("page-content").prepend(box);
    const toggle=box.querySelector("#create-account"),accountFields=box.querySelector("#account-fields");
    toggle.addEventListener("change",()=>accountFields.classList.toggle("hidden",!toggle.checked));
    $("cancel-employee").addEventListener("click",()=>box.remove());
    $("employee-form").addEventListener("submit",async ev=>{
      ev.preventDefault();const form=ev.currentTarget,f=new FormData(form),err=$("employee-error");
      const createAccount=f.get("create_account")==="on",email=String(f.get("email")||"").trim(),temporaryPassword=String(f.get("temporary_password")||"");
      if(createAccount&&(!email||temporaryPassword.length<6)){err.textContent="Para crear la cuenta necesitas correo y contraseña provisional de al menos 6 caracteres.";return;}
      const row={full_name:String(f.get("full_name")).trim(),employee_code:String(f.get("employee_code")).trim()||null,start_date:f.get("start_date")||null,work_percentage:Number(f.get("work_percentage")),irpf:Number(f.get("irpf")),active:true,dni:String(f.get("dni")).trim(),tip:String(f.get("tip")).trim()||null,tip_expiry:f.get("tip_expiry")||null,phone:String(f.get("phone")).trim()||null,email:email||null,post:String(f.get("post")).trim()||null,category:String(f.get("category")).trim()||null,service:String(f.get("service")).trim()||null,username:String(f.get("username")).trim()||null,blocked:false};
      const submit=form.querySelector('button[type="submit"]');submit.disabled=true;submit.textContent="Guardando…";
      const {data:employee,error}=await db.from("employees").insert(row).select("id").single();
      if(error){err.textContent="No se pudo guardar. Comprueba que has aplicado la migración SQL: "+error.message;submit.disabled=false;submit.textContent="Guardar trabajador";return;}
      if(createAccount){
        submit.textContent="Creando cuenta…";
        const {data,error:accountError}=await db.functions.invoke("create-employee-account",{body:{employee_id:employee.id,full_name:row.full_name,email,temporary_password:temporaryPassword}});
        if(accountError||!data?.success){err.textContent="La ficha se guardó, pero no se pudo crear la cuenta: "+(accountError?.message||data?.error||"Error desconocido");submit.disabled=false;submit.textContent="Guardar trabajador";await loadEmployees();return;}
      }
      notify(createAccount?"Trabajador y cuenta creados correctamente.":"Ficha del trabajador guardada en Supabase.");
      box.remove();await loadEmployees();
    });
  }
  async function personalPage(){
    setContent(moduleHeader("Personal","Trabajadores y datos básicos de plantilla.","+ Añadir trabajador","add-employee"));
    $("add-employee").addEventListener("click",employeeForm);
    try{await loadEmployees();}catch(e){$("module-table").innerHTML='<p class="error">No se pudo consultar employees: '+esc(e.message)+'</p>';}
  }
  function renderShiftRows(rows){
    if(!rows.length)return '<p class="muted">Todavía no hay turnos registrados.</p>';
    const map=new Map(employeesCache.map(e=>[String(e.id),e.full_name]));
    return '<table class="data-table"><thead><tr><th>Trabajador</th><th>Puesto</th><th>Tipo</th><th>Inicio</th><th>Fin</th><th></th></tr></thead><tbody>'+rows.map(s=>'<tr><td>'+esc(map.get(String(s.employee_id))||"Trabajador "+s.employee_id)+'</td><td>'+esc(s.position)+'</td><td>'+esc(s.shift_type)+'</td><td>'+dateText(s.start_at)+'</td><td>'+dateText(s.end_at)+'</td><td><button class="secondary small-action" data-delete="'+esc(s.id)+'">Eliminar</button></td></tr>').join("")+'</tbody></table>';
  }
  async function loadShifts(){
    const {data,error}=await db.from("shifts").select("*").order("start_at",{ascending:false}).limit(250);
    if(error)throw error;
    $("module-table").innerHTML=renderShiftRows(data||[]);
    $("module-table").querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",async()=>{
      if(!confirm("¿Eliminar este turno? Esta acción no se puede deshacer."))return;
      const {error}=await db.from("shifts").delete().eq("id",b.dataset.delete);
      if(error){notify("No se pudo eliminar: "+error.message);return;}
      notify("Turno eliminado.");await loadShifts();
    }));
  }
  function shiftForm(){
    const box=document.createElement("div");box.className="form-panel";
    const posts=["Puerta","VS1","VS2","VS3","VS4","VS5","VS6","VS10","VS11","VS15","VS20","VS30","VS40"];
    const postOptions=posts.map(p=>'<option value="'+p+'">'+p+'</option>').join("");
    box.innerHTML='<form id="shift-form" class="record-form"><h3>Crear cuadrante / asignar turnos</h3><div class="form-grid"><label>Trabajador<select name="employee_id" required></select></label><label>Puesto<select name="position" required>'+postOptions+'</select></label><label>Fecha de inicio<input name="date_from" type="date" required></label><label>Fecha de fin<input name="date_to" type="date"></label><label>Turno inicial<select name="shift_type" required></select></label><label>Servicio / centro<input name="service" placeholder="Ej. Casa Juvenil de Sograndio"></label></div><label class="rotation-option"><input name="rotation" type="checkbox"> Rotar automáticamente entre los turnos disponibles cada día</label><div class="form-actions"><button class="primary" type="submit">Asignar turnos</button><button class="secondary" type="button" id="cancel-shift">Cancelar</button></div><p class="error" id="shift-error"></p></form>';
    $("page-content").prepend(box);
    const form=box.querySelector("#shift-form"),post=form.elements.position,shift=form.elements.shift_type,staff=form.elements.employee_id;
    employeesCache.filter(e=>e.active&&!e.blocked).forEach(e=>staff.add(new Option(e.full_name,e.id)));
    const optionsFor=p=>["VS6","VS10","VS20","VS30","VS40"].includes(p)?["Mañana 07:00-15:00","Tarde 15:00-23:00"]:["Mañana 07:00-15:00","Tarde 15:00-22:00","Noche 22:00-07:00"];
    const refresh=()=>{const prev=shift.value;shift.replaceChildren(...optionsFor(post.value).map(x=>new Option(x,x)));if(optionsFor(post.value).includes(prev))shift.value=prev;};
    post.addEventListener("change",refresh);refresh();
    $("cancel-shift").addEventListener("click",()=>box.remove());
    form.addEventListener("submit",async ev=>{
      ev.preventDefault();const f=new FormData(form),err=$("shift-error");
      const from=new Date(f.get("date_from")+"T12:00:00"),to=f.get("date_to")?new Date(f.get("date_to")+"T12:00:00"):new Date(from);
      if(Number.isNaN(from.getTime())||Number.isNaN(to.getTime())||to<from){err.textContent="Revisa las fechas del cuadrante.";return;}
      const days=Math.round((to-from)/86400000)+1;if(days>93){err.textContent="El periodo máximo es de 93 días.";return;}
      const p=String(f.get("position")),opts=optionsFor(p),base=opts.indexOf(String(f.get("shift_type"))),rotation=f.get("rotation")==="on";
      const rows=[];
      for(let i=0;i<days;i++){
        const d=new Date(from);d.setDate(d.getDate()+i);
        const sh=opts[rotation?(base+i)%opts.length:base];
        const match=sh.match(/(\d{2}:\d{2})-(\d{2}:\d{2})/);if(!match)continue;
        const startAt=new Date(d);const [aH,aM]=match[1].split(":").map(Number);startAt.setHours(aH,aM,0,0);
        const endAt=new Date(d);const [bH,bM]=match[2].split(":").map(Number);endAt.setHours(bH,bM,0,0);if(endAt<=startAt)endAt.setDate(endAt.getDate()+1);
        const hours=sh.includes("07:00-15:00")||sh.includes("15:00-23:00")?8:sh.includes("15:00-22:00")?7:9;
        rows.push({employee_id:f.get("employee_id"),position:p,shift_type:sh,start_at:startAt.toISOString(),end_at:endAt.toISOString(),service:String(f.get("service")||"").trim()||null,hours,holiday:d.getDay()===0});
      }
      const submit=form.querySelector('button[type="submit"]');submit.disabled=true;submit.textContent="Asignando…";
      const {error}=await db.from("shifts").insert(rows);
      if(error){err.textContent="No se pudieron asignar los turnos: "+error.message;submit.disabled=false;submit.textContent="Asignar turnos";return;}
      notify(rows.length+" turno(s) asignado(s) correctamente.");box.remove();await loadShifts();
    });
  }
  async function shiftsPage(){
    setContent(moduleHeader("Cuadrantes","Turnos asignados por trabajador, puesto y horario.","+ Añadir turno","add-shift"));
    $("add-shift").addEventListener("click",async()=>{
      try{const {data,error}=await db.from("employees").select("*").eq("active",true).order("full_name");if(error)throw error;employeesCache=data||[];if(!employeesCache.length){notify("Primero debes registrar un trabajador activo.");return;}shiftForm();}catch(e){notify("No se pudo cargar el personal: "+e.message);}
    });
    try{
      const {data,error}=await db.from("employees").select("*").order("full_name");if(error)throw error;employeesCache=data||[];
      await loadShifts();
    }catch(e){$("module-table").innerHTML='<p class="error">No se pudieron consultar los cuadrantes: '+esc(e.message)+'</p>';}
  }
  const coveragePosts=["Puerta","VS1","VS2","VS3","VS4","VS5","VS6","VS10","VS11","VS15","VS20","VS30","VS40"];
  const coverageShifts=post=>["VS6","VS10","VS20","VS30","VS40"].includes(post)?["Mañana 07:00-15:00","Tarde 15:00-23:00"]:["Mañana 07:00-15:00","Tarde 15:00-22:00","Noche 22:00-07:00"];
  const localDateKey=value=>{const d=new Date(value);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");};
  let coverageMonthOffset=0;
  async function coveragePage(){
    const base=new Date();base.setDate(1);base.setMonth(base.getMonth()+coverageMonthOffset);
    const year=base.getFullYear(),month=base.getMonth(),monthName=base.toLocaleDateString("es-ES",{month:"long",year:"numeric"});
    const first=new Date(year,month,1),last=new Date(year,month+1,1);
    setContent('<section class="panel"><div class="panel-head"><div><h3>Cobertura mensual</h3><p>Consulta los puestos y días pendientes.</p></div><div class="form-actions"><button class="secondary" id="coverage-prev">‹</button><strong id="coverage-month">'+esc(monthName.toUpperCase())+'</strong><button class="secondary" id="coverage-next">›</button></div></div><div id="coverage-summary" class="notice">Calculando cobertura…</div><div id="coverage-posts" class="stats-grid"></div><div id="coverage-detail"></div></section>');
    $("coverage-prev").addEventListener("click",()=>{coverageMonthOffset--;coveragePage();});
    $("coverage-next").addEventListener("click",()=>{coverageMonthOffset++;coveragePage();});
    const {data:shifts,error}=await db.from("shifts").select("id,employee_id,position,shift_type,start_at,end_at,service,hours").gte("start_at",first.toISOString()).lt("start_at",last.toISOString());
    if(error){$("coverage-summary").textContent="No se pudo consultar la cobertura: "+error.message;return;}
    const {data:staff, error:staffError}=await db.from("employees").select("id,full_name,active,blocked").eq("active",true).order("full_name");
    if(staffError){$("coverage-summary").textContent="No se pudo cargar el personal: "+staffError.message;return;}
    employeesCache=staff||[];
    const bySlot=new Map();
    (shifts||[]).forEach(s=>{const k=localDateKey(s.start_at)+"|"+s.position+"|"+s.shift_type;if(!bySlot.has(k))bySlot.set(k,[]);bySlot.get(k).push(s);});
    const days=new Date(year,month+1,0).getDate();
    let total=0,covered=0;
    const postsHtml=coveragePosts.map(post=>{
      let missing=0,filled=0;
      for(let day=1;day<=days;day++)for(const shift of coverageShifts(post)){
        total++;const key=year+"-"+String(month+1).padStart(2,"0")+"-"+String(day).padStart(2,"0")+"|"+post+"|"+shift;
        if((bySlot.get(key)||[]).length){covered++;filled++;}else missing++;
      }
      return '<article class="stat-card"><span>'+esc(post)+'</span><strong>'+ (missing===0?'Completo':missing+' huecos')+'</strong><small>'+filled+' turnos cubiertos</small><button class="secondary small-action" data-coverage-post="'+esc(post)+'">Ver días y asignar</button></article>';
    }).join("");
    const pct=total?Math.round(covered*100/total):0;
    $("coverage-summary").innerHTML='<strong>'+pct+'% de cobertura mensual</strong><p>'+covered+' de '+total+' turnos cubiertos · '+(total-covered)+' sin cubrir.</p><p>Se calcula según los puestos y turnos definidos en SECURCONTROL.</p>';
    $("coverage-posts").innerHTML=postsHtml;
    $("coverage-posts").querySelectorAll("[data-coverage-post]").forEach(b=>b.addEventListener("click",()=>showCoverageDetail(b.dataset.coveragePost,year,month,days,bySlot)));
  }
  function showCoverageDetail(post,year,month,days,bySlot){
    const detail=$("coverage-detail");
    let html='<div class="notice"><h3>'+esc(post)+' · '+new Date(year,month,1).toLocaleDateString("es-ES",{month:"long",year:"numeric"})+'</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Fecha</th><th>Turno</th><th>Asignación</th><th></th></tr></thead><tbody>';
    for(let day=1;day<=days;day++)for(const shift of coverageShifts(post)){
      const date=year+"-"+String(month+1).padStart(2,"0")+"-"+String(day).padStart(2,"0"),rows=bySlot.get(date+"|"+post+"|"+shift)||[];
      if(rows.length)rows.forEach(s=>{const employee=employeesCache.find(e=>String(e.id)===String(s.employee_id));html+='<tr><td>'+String(day).padStart(2,"0")+'/'+String(month+1).padStart(2,"0")+'</td><td>'+esc(shift)+'</td><td>'+esc(employee?.full_name||"Trabajador asignado")+'</td><td>—</td></tr>';});
      else html+='<tr><td>'+String(day).padStart(2,"0")+'/'+String(month+1).padStart(2,"0")+'</td><td>'+esc(shift)+'</td><td><span class="tag">Sin cubrir</span></td><td><button class="primary small-action" data-coverage-assign="'+esc(date)+'" data-shift="'+esc(shift)+'">Asignar</button></td></tr>';
    }
    html+='</tbody></table></div></div>';detail.innerHTML=html;
    detail.querySelectorAll("[data-coverage-assign]").forEach(b=>b.addEventListener("click",()=>assignCoverageSlot(b.dataset.coverageAssign,post,b.dataset.shift)));
  }
  async function assignCoverageSlot(date,post,shift){
    const staff=employeesCache.filter(e=>e.active&&!e.blocked);
    if(!staff.length){notify("No hay trabajadores activos disponibles.");return;}
    const selector=document.createElement("div");selector.className="form-panel";
    selector.innerHTML='<form class="record-form"><h3>Asignar '+esc(post)+' · '+esc(date)+'</h3><label>Trabajador<select name="employee_id" required></select></label><label>Servicio / centro<input name="service" placeholder="Servicio o centro"></label><div class="form-actions"><button class="primary" type="submit">Guardar asignación</button><button class="secondary" type="button">Cancelar</button></div></form>';
    const select=selector.querySelector("select");staff.forEach(e=>select.add(new Option(e.full_name,e.id)));
    $("coverage-detail").prepend(selector);
    selector.querySelector('button[type="button"]').addEventListener("click",()=>selector.remove());
    selector.querySelector("form").addEventListener("submit",async ev=>{
      ev.preventDefault();const f=new FormData(ev.currentTarget),match=shift.match(/(\d{2}):(\d{2})-(\d{2}):(\d{2})/);
      const start=new Date(date+"T"+match[1]+":"+match[2]+":00"),end=new Date(date+"T"+match[3]+":"+match[4]+":00");if(end<=start)end.setDate(end.getDate()+1);
      const hours=shift.includes("15:00-22:00")?7:shift.includes("22:00-07:00")?9:8;
      const {error}=await db.from("shifts").insert({employee_id:f.get("employee_id"),position:post,shift_type:shift,start_at:start.toISOString(),end_at:end.toISOString(),service:String(f.get("service")||"").trim()||null,hours,holiday:start.getDay()===0});
      if(error){notify("No se pudo asignar: "+error.message);return;}
      notify("Turno asignado correctamente.");coveragePage();
    });
  }
  async function renderPage(id){
    const allowed=(profile.role==="admin"?adminNav:guardNav).some(x=>x[0]===id);
    if(!allowed){notify("No tienes permiso para esta sección.");return;}
    renderNav(id);$("page-title").textContent=labels[id]||"SECURCONTROL";
    if(id==="dashboard"){await dashboard();return;}
    if(id==="personal"&&profile.role==="admin"){await personalPage();return;}
    if(id==="shifts"&&profile.role==="admin"){await shiftsPage();return;}
    if(id==="coverage"&&profile.role==="admin"){await coveragePage();return;}
    const desc={coverage:"Consulta de cobertura de puestos.",vacations:"Gestión de solicitudes de vacaciones.",hours:"Horas ordinarias, extras, nocturnidad y festivos.",payroll:"Configuración y consulta de nóminas.",docs:"Documentación de trabajo.",material:"Inventario y control de material.",punches:"Registro de entradas y salidas.", "my-shifts":"Consulta de turnos asignados.","my-payroll":"Información de nómina.",profile:"Datos de tu cuenta."};
    setContent('<section class="panel module-panel"><span class="module-icon">✦</span><p class="eyebrow">MÓDULO SECURCONTROL</p><h2>'+esc(labels[id])+'</h2><p>'+esc(desc[id]||"")+'</p><div class="notice"><strong>Módulo pendiente de conexión</strong><p>Esta sección se conectará en la siguiente fase. Los módulos Personal y Cuadrantes ya consultan y guardan datos en Supabase.</p></div><button class="secondary" id="back-dashboard">Volver al resumen</button></section>');
    $("back-dashboard").addEventListener("click",()=>renderPage("dashboard"));
  }
  async function startSession(session){
    const {data,error}=await db.from("profiles").select("id,full_name,role,active").eq("id",session.user.id).maybeSingle();
    if(error)throw error;
    if(!data||!data.active||!["admin","vigilante"].includes(data.role))throw new Error("Tu usuario no tiene un perfil activo autorizado.");
    profile=data;authUser=session.user;
    $("user-name").textContent=profile.full_name||authUser.email;$("user-role").textContent=profile.role==="admin"?"Administrador":"Vigilante";
    $("user-avatar").textContent=(profile.full_name||authUser.email||"U").trim().charAt(0).toUpperCase();
    showApp();await renderPage("dashboard");
  }
  async function init(){
    if(!config?.SUPABASE_URL||!config?.SUPABASE_PUBLISHABLE_KEY||!window.supabase?.createClient){showLogin("No se ha podido configurar la conexión con Supabase.");return;}
    db=window.supabase.createClient(config.SUPABASE_URL,config.SUPABASE_PUBLISHABLE_KEY);
    $("login-form").addEventListener("submit",async e=>{
      e.preventDefault();$("login-error").textContent="";const b=$("login-form").querySelector("button");b.disabled=true;b.textContent="Comprobando…";
      const {data,error}=await db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});
      b.disabled=false;b.textContent="Iniciar sesión";
      if(error){$("login-error").textContent="No se pudo iniciar sesión. Comprueba el correo y la contraseña.";return;}
      try{await startSession(data.session);}catch(err){await db.auth.signOut();showLogin(err.message);}
    });
    $("logout-btn").addEventListener("click",async()=>{await db.auth.signOut();profile=null;authUser=null;showLogin("");});
    const {data:{session}}=await db.auth.getSession();
    if(session){try{await startSession(session);}catch(err){await db.auth.signOut();showLogin(err.message);}}
    db.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT")showLogin("");});
  }
  document.addEventListener("DOMContentLoaded",init);
})();