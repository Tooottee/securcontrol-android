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
    return '<table class="data-table"><thead><tr><th>Nombre</th><th>Código</th><th>Jornada</th><th>IRPF</th><th>Estado</th><th></th></tr></thead><tbody>'+rows.map(e=>'<tr><td>'+esc(e.full_name)+'</td><td>'+esc(e.employee_code||"—")+'</td><td>'+esc(e.work_percentage??100)+'%</td><td>'+esc(e.irpf??0)+'%</td><td><span class="tag">'+(e.active?"Activo":"Inactivo")+'</span></td><td><button class="secondary small-action" data-toggle="'+esc(e.id)+'" data-active="'+String(!!e.active)+'">'+(e.active?"Desactivar":"Activar")+'</button></td></tr>').join("")+'</tbody></table>';
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
    const box=document.createElement("div");box.className="form-panel";box.id="shift-form-panel";
    const opts=employeesCache.filter(e=>e.active).map(e=>'<option value="'+esc(e.id)+'">'+esc(e.full_name)+'</option>').join("");
    box.innerHTML='<form id="shift-form" class="record-form"><h3>Asignar turno</h3><div class="form-grid"><label>Trabajador<select name="employee_id" required>'+opts+'</select></label><label>Puesto<input name="position" required placeholder="Ej. VS1"></label><label>Tipo de turno<select name="shift_type" required><option value="Mañana">Mañana</option><option value="Tarde">Tarde</option><option value="Tarde2">Tarde2</option><option value="Noche">Noche</option><option value="Otro">Otro</option></select></label><label>Inicio<input name="start_at" type="datetime-local" required></label><label>Fin<input name="end_at" type="datetime-local" required></label></div><div class="form-actions"><button class="primary" type="submit">Guardar turno</button><button class="secondary" type="button" id="cancel-shift">Cancelar</button></div><p class="error" id="shift-error"></p></form>';
    $("page-content").prepend(box);
    $("cancel-shift").addEventListener("click",()=>box.remove());
    $("shift-form").addEventListener("submit",async ev=>{
      ev.preventDefault();const f=new FormData(ev.currentTarget);
      const start=new Date(f.get("start_at")),end=new Date(f.get("end_at"));
      if(!(end>start)){$("shift-error").textContent="La hora de fin debe ser posterior a la de inicio. Para noches, selecciona el día siguiente.";return;}
      const row={employee_id:f.get("employee_id"),position:f.get("position").trim(),shift_type:f.get("shift_type"),start_at:start.toISOString(),end_at:end.toISOString()};
      const {error}=await db.from("shifts").insert(row);
      if(error){$("shift-error").textContent="No se pudo guardar: "+error.message;return;}
      notify("Turno guardado en Supabase.");box.remove();await loadShifts();
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
  async function renderPage(id){
    const allowed=(profile.role==="admin"?adminNav:guardNav).some(x=>x[0]===id);
    if(!allowed){notify("No tienes permiso para esta sección.");return;}
    renderNav(id);$("page-title").textContent=labels[id]||"SECURCONTROL";
    if(id==="dashboard"){await dashboard();return;}
    if(id==="personal"&&profile.role==="admin"){await personalPage();return;}
    if(id==="shifts"&&profile.role==="admin"){await shiftsPage();return;}
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