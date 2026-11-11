(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const config = window.SECURCONTROL_CONFIG;
  let client = null;
  let currentProfile = null;
  let currentUser = null;

  const adminItems = [
    ["dashboard","Resumen","▦"],["personal","Personal","♙"],["shifts","Cuadrantes","▦"],
    ["coverage","Cobertura","◫"],["vacations","Vacaciones","▣"],["hours","Control horario","◷"],
    ["payroll","Nóminas","€"],["docs","Documentación","▤"],["material","Material","▣"]
  ];
  const guardItems = [
    ["dashboard","Inicio","▦"],["punches","Fichar","◷"],["my-shifts","Mi cuadrante","▦"],
    ["my-payroll","Mi nómina","€"],["profile","Mi perfil","♙"]
  ];
  const labels = Object.fromEntries([...adminItems,...guardItems].map(([id,label])=>[id,label]));

  function notify(message) {
    const el = $("toast"); el.textContent = message; el.classList.add("show");
    window.setTimeout(() => el.classList.remove("show"), 3200);
  }
  function showLogin(message = "") {
    $("login-view").classList.remove("hidden"); $("app-view").classList.add("hidden");
    $("login-error").textContent = message;
  }
  function showApp() { $("login-view").classList.add("hidden"); $("app-view").classList.remove("hidden"); }
  function escapeText(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

  async function loadProfile(user) {
    const { data, error } = await client.from("profiles")
      .select("id, full_name, role, active").eq("id", user.id).maybeSingle();
    if (error) throw error;
    if (!data || data.active !== true || !["admin","vigilante"].includes(data.role)) {
      throw new Error("Tu usuario no tiene un perfil activo autorizado. Contacta con el administrador.");
    }
    currentProfile = data; currentUser = user;
  }

  function renderNav(active = "dashboard") {
    const items = currentProfile.role === "admin" ? adminItems : guardItems;
    $("main-nav").replaceChildren();
    items.forEach(([id,label,icon]) => {
      const button = document.createElement("button");
      button.className = "nav-item" + (id === active ? " active" : "");
      button.type = "button"; button.innerHTML = '<span aria-hidden="true">'+icon+'</span><b>'+label+'</b>';
      button.addEventListener("click", () => renderPage(id));
      $("main-nav").append(button);
    });
  }

  async function countTable(table) {
    const { count, error } = await client.from(table).select("id", {count:"exact",head:true});
    if (error) return "—";
    return count ?? 0;
  }
  function statCard(label,value,caption) {
    return '<article class="stat-card"><span>'+label+'</span><strong>'+value+'</strong><small>'+caption+'</small></article>';
  }
  async function renderDashboard() {
    const admin = currentProfile.role === "admin";
    $("page-content").innerHTML = '<div class="welcome"><div><p class="eyebrow">BIENVENIDO/A</p><h2>'+escapeText(currentProfile.full_name || currentUser.email)+'</h2><p>Este es el estado de tu espacio SECURCONTROL.</p></div><span class="welcome-icon">✦</span></div><div id="stats" class="stats-grid"><div class="stat-card skeleton">Cargando datos…</div></div><section class="panel"><div class="panel-head"><div><h3>Panel de control</h3><p>Accesos disponibles según tu perfil</p></div><span class="tag">'+(admin?"ADMINISTRACIÓN":"VIGILANTE")+'</span></div><div class="quick-links" id="quick-links"></div></section><section class="notice"><strong>Sincronización centralizada</strong><p>Esta versión web ya inicia sesión con Supabase. Los módulos se irán conectando y validando uno a uno; todavía no se modifican datos operativos desde esta pantalla.</p></section>';
    const stats = $("stats");
    if (admin) {
      const [employees,shifts,vacations,punches] = await Promise.all([
        countTable("employees"),countTable("shifts"),countTable("vacation_requests"),countTable("time_punches")
      ]);
      stats.innerHTML = statCard("PERSONAL",employees,"Trabajadores registrados")+statCard("TURNOS",shifts,"Turnos registrados")+statCard("SOLICITUDES",vacations,"Solicitudes de vacaciones")+statCard("FICHAJES",punches,"Registros de fichaje");
    } else {
      stats.innerHTML = statCard("TU CUENTA","Activa","Acceso verificado")+statCard("PERFIL", "Vigilante","Permisos individuales");
    }
    const items = admin ? adminItems.slice(1) : guardItems.slice(1);
    $("quick-links").innerHTML = items.map(([id,label,icon])=>'<button class="quick-link" data-page="'+id+'"><span>'+icon+'</span>'+label+' <b>→</b></button>').join("");
    $("quick-links").querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>renderPage(b.dataset.page)));
  }

  async function renderPage(id) {
    const permitted = (currentProfile.role === "admin" ? adminItems : guardItems).some(item=>item[0]===id);
    if (!permitted) { notify("No tienes permiso para acceder a esta sección."); return; }
    renderNav(id); $("page-title").textContent = labels[id] || "SECURCONTROL";
    if (id === "dashboard") { await renderDashboard(); return; }
    const descriptions = {
      personal:"Gestión de trabajadores, códigos, jornadas y configuración individual.",
      shifts:"Planificación de turnos y cuadrantes por puesto y trabajador.",
      coverage:"Consulta de cobertura de los puestos y detección de huecos.",
      vacations:"Consulta y gestión de solicitudes de vacaciones.",
      hours:"Seguimiento de horas ordinarias, extras, nocturnidad y festivos.",
      payroll:"Configuración y consulta de previsiones de nómina.",
      docs:"Documentación y archivos de trabajo.",
      material:"Inventario y control de material.",
      punches:"Registra y consulta tus entradas y salidas.",
      "my-shifts":"Consulta tus turnos asignados.",
      "my-payroll":"Consulta tu información de nómina.",
      profile:"Datos de tu cuenta y perfil de acceso."
    };
    $("page-content").innerHTML = '<section class="panel module-panel"><span class="module-icon">✦</span><p class="eyebrow">MÓDULO SECURCONTROL</p><h2>'+escapeText(labels[id])+'</h2><p>'+escapeText(descriptions[id] || "")+'</p><div class="notice"><strong>Módulo pendiente de conexión</strong><p>La estructura visual y el control de acceso están preparados. Esta sección aún no realiza operaciones para evitar guardar información incompleta o alterar datos reales.</p></div><button class="secondary" id="back-dashboard">Volver al resumen</button></section>';
    $("back-dashboard").addEventListener("click",()=>renderPage("dashboard"));
  }

  async function startSession(session) {
    await loadProfile(session.user);
    $("user-name").textContent = currentProfile.full_name || session.user.email;
    $("user-role").textContent = currentProfile.role === "admin" ? "Administrador" : "Vigilante";
    $("user-avatar").textContent = (currentProfile.full_name || session.user.email || "U").trim().charAt(0).toUpperCase();
    showApp(); await renderPage("dashboard");
  }

  async function init() {
    if (!config || !config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY ||
        config.SUPABASE_URL.includes("TU-PROYECTO") || config.SUPABASE_PUBLISHABLE_KEY.includes("TU_CLAVE")) {
      showLogin("Falta configurar Supabase. Sigue los pasos del README de la carpeta web.");
      $("login-form").addEventListener("submit", e=>e.preventDefault());
      return;
    }
    if (!window.supabase?.createClient) { showLogin("No se pudo cargar el cliente de Supabase. Comprueba tu conexión."); return; }
    client = window.supabase.createClient(config.SUPABASE_URL,config.SUPABASE_PUBLISHABLE_KEY);
    $("login-form").addEventListener("submit",async e=>{
      e.preventDefault(); $("login-error").textContent = "";
      const button = $("login-form").querySelector("button"); button.disabled = true; button.textContent = "Comprobando…";
      const {data,error} = await client.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});
      button.disabled = false; button.textContent = "Iniciar sesión";
      if (error) { $("login-error").textContent = "No se pudo iniciar sesión. Comprueba el correo y la contraseña."; return; }
      try { await startSession(data.session); } catch(err) { await client.auth.signOut(); showLogin(err.message || "No se pudo cargar el perfil."); }
    });
    $("logout-btn").addEventListener("click",async()=>{await client.auth.signOut();currentProfile=null;currentUser=null;showLogin();});
    const {data:{session}} = await client.auth.getSession();
    if (session) { try { await startSession(session); } catch(err) { await client.auth.signOut(); showLogin(err.message || "Perfil no válido."); } }
    client.auth.onAuthStateChange((event,session)=>{ if(event==="SIGNED_OUT") showLogin(); });
  }
  document.addEventListener("DOMContentLoaded",init);
})();