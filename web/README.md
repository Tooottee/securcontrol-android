# SECURCONTROL Web (base inicial)

Esta carpeta añade la primera base web sin modificar ni sustituir la aplicación Android existente. La web y Android están pensadas para utilizar el mismo proyecto Supabase.

## Estado de esta entrega
- Interfaz adaptable a PC, tablet y móvil.
- Inicio/cierre de sesión con Supabase Auth.
- Lectura del perfil en `profiles` y control de acceso por rol `admin` / `vigilante`.
- Panel ADMIN con contadores de las tablas disponibles, sujetos a RLS.
- Navegación diferenciada por rol.
- Los módulos operativos se muestran como pendientes: todavía no crean ni modifican registros.

## Configuración local
1. Copia `supabase-config.example.js` y ponle el nombre `supabase-config.js`.
2. Abre `supabase-config.js` y completa `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` con los valores de tu proyecto Supabase.
3. No uses nunca la clave Secret ni service_role en el navegador.
4. Sirve esta carpeta con un servidor web local (por ejemplo, la extensión Live Server de VS Code). No abras el HTML mediante `file://`.
5. En Supabase Auth, configura la URL de tu web en Site URL / Redirect URLs cuando tengas un dominio o URL local estable.

## Estructura esperada de Supabase
La base inicial utiliza las tablas `profiles`, `employees`, `shifts`, `time_punches`, `it_leaves`, `vacation_requests` y `payroll_settings`.
El perfil debe existir en `profiles`, tener el mismo UUID que el usuario de Auth y estar activo. Los roles aceptados son `admin` y `vigilante`.

## Seguridad y siguientes pasos
La Publishable key está diseñada para uso público, pero la seguridad real depende de RLS y de las políticas SQL. Antes de habilitar escritura en cada módulo habrá que revisar las políticas, probar acceso de administrador y vigilante con cuentas distintas y verificar que ningún vigilante pueda leer o modificar datos de otro trabajador. No se incorpora ninguna clave privada al repositorio.
