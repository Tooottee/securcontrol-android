// Supabase Edge Function: create-employee-account
// Configure SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY
// as Edge Function secrets. NEVER put SERVICE_ROLE_KEY in the web app.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  // Supabase now injects named secret API keys as a JSON dictionary.
  // Use the default secret key for privileged server-side operations.
  let serviceKey = "";
  try {
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    serviceKey = String(secretKeys.default ?? "");
  } catch (error) {
    console.error("No se pudo leer SUPABASE_SECRET_KEYS:", error);
  }
  const authHeader = req.headers.get("Authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!url || !serviceKey) {
    console.error("Configuración incompleta: falta SUPABASE_URL o la clave default de SUPABASE_SECRET_KEYS");
    return json({ error: "La función no tiene configuradas sus credenciales internas en Supabase." }, 500);
  }
  if (!accessToken) return json({ error: "No se recibió la sesión del administrador. Cierra sesión y vuelve a entrar." }, 401);

  // Validate the caller's access token directly against Supabase Auth.
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !userData.user) {
    console.error("Token de sesión rechazado:", userError?.message ?? "sin usuario");
    return json({ error: "La sesión ha caducado o no es válida. Cierra sesión y vuelve a entrar." }, 401);
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role,active")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) {
    console.error("No se pudo consultar el perfil administrador:", profileError.message);
    return json({ error: "No se pudo verificar el perfil de administrador." }, 500);
  }
  if (String(profile?.role ?? "").trim().toLowerCase() !== "admin" || profile?.active !== true) {
    console.error("Acceso rechazado: perfil no administrador o inactivo", {
      user_id: userData.user.id,
      role: profile?.role ?? null,
      active: profile?.active ?? null,
    });
    return json({ error: "La sesión es válida, pero el perfil asociado no figura como administrador activo." }, 403);
  }

  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return json({ error: "JSON no válido" }, 400); }

  const fullName = String(input.full_name ?? "").trim();
  const username = String(input.username ?? "").trim().toUpperCase().replace(/\\s+/g, "");
  const email = username ? username.toLowerCase() + "@usuarios.securcontrol.invalid" : "";
  const password = String(input.temporary_password ?? "");
  const employeeId = String(input.employee_id ?? "");
  if (!fullName || !username || password.length < 6 || !employeeId)
    return json({ error: "Nombre, DNI/usuario, contraseña provisional (mínimo 6 caracteres) y trabajador son obligatorios" }, 400);

  const { data: employee, error: employeeError } = await admin
    .from("employees").select("id,user_id,dni,username").eq("id", employeeId).maybeSingle();
  if (employeeError || !employee) return json({ error: "Trabajador no encontrado" }, 404);
  if (employee.user_id) return json({ error: "Este trabajador ya tiene una cuenta vinculada" }, 409);
  if (String(employee.dni ?? "").trim().toUpperCase().replace(/\\s+/g, "") !== username)
    return json({ error: "El usuario debe coincidir con el DNI guardado en la ficha del trabajador" }, 400);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: fullName, username, must_change_password: true }
  });
  if (createError || !created.user) return json({ error: createError?.message ?? "No se pudo crear el usuario" }, 400);

  const userId = created.user.id;
  const { error: profileInsertError } = await admin.from("profiles").insert({
    id: userId, full_name: fullName, role: "vigilante", active: true
  });
  if (profileInsertError) {
    await admin.auth.admin.deleteUser(userId);
    return json({ error: "No se pudo crear el perfil: " + profileInsertError.message }, 500);
  }

  const { error: linkError } = await admin.from("employees").update({
    user_id: userId, username, full_name: fullName
  }).eq("id", employeeId);
  if (linkError) {
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
    return json({ error: "No se pudo vincular el trabajador: " + linkError.message }, 500);
  }

  return json({ success: true, user_id: userId, message: "Cuenta de vigilante creada y vinculada" });
});
