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

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Sesión no válida" }, 401);

  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return json({ error: "Sesión no válida" }, 401);

  const admin = createClient(url, serviceKey);
  const { data: profile, error: profileError } = await admin
    .from("profiles").select("role,active").eq("id", userData.user.id).maybeSingle();
  if (profileError || profile?.role !== "admin" || profile.active !== true)
    return json({ error: "Sólo un administrador activo puede crear cuentas" }, 403);

  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return json({ error: "JSON no válido" }, 400); }

  const fullName = String(input.full_name ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  const password = String(input.temporary_password ?? "");
  const employeeId = String(input.employee_id ?? "");
  if (!fullName || !email || password.length < 6 || !employeeId)
    return json({ error: "Nombre, correo, contraseña provisional (mínimo 6 caracteres) y trabajador son obligatorios" }, 400);

  const { data: employee, error: employeeError } = await admin
    .from("employees").select("id,user_id").eq("id", employeeId).maybeSingle();
  if (employeeError || !employee) return json({ error: "Trabajador no encontrado" }, 404);
  if (employee.user_id) return json({ error: "Este trabajador ya tiene una cuenta vinculada" }, 409);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: fullName, must_change_password: true }
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
    user_id: userId, email, full_name: fullName
  }).eq("id", employeeId);
  if (linkError) {
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
    return json({ error: "No se pudo vincular el trabajador: " + linkError.message }, 500);
  }

  return json({ success: true, user_id: userId, message: "Cuenta de vigilante creada y vinculada" });
});
