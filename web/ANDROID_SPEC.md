# SECURCONTROL Web — especificación funcional Android 1.2.3

Fuente revisada: `app/src/main/java/com/securcontrol/app/MainActivity.java` del ZIP Android 1.2.3(1).

## Objetivo
La web debe reproducir los flujos del Android y compartir datos y autenticación mediante Supabase. El Android del ZIP usa actualmente SharedPreferences locales; por tanto, todavía NO comparte datos con Supabase. La sincronización real requerirá una actualización posterior del APK.

## Navegación Android
### Administrador
Panel, Personal, Cuadrantes, Cobertura, Vacaciones, Horas, Nómina, Docs y Material.

### Vigilante
Inicio, Fichar, Cuadrante, Nómina y Perfil.

## Personal
Ficha Android: nombre, DNI/NIE, TIP, caducidad TIP, teléfono, correo electrónico, puesto, categoría, servicio/centro y usuario. La creación de un vigilante exige nombre, DNI y usuario; la contraseña provisional debe tener al menos 6 caracteres. La ficha permite editar, bloquear/desbloquear el acceso y restablecer contraseña provisional. En el primer acceso el vigilante debe cambiar la contraseña.

La versión web actual sólo guarda nombre, código, fecha de alta, jornada e IRPF; es una implementación parcial y debe ampliarse.

## Puestos y turnos
Puestos: Puerta, VS1, VS2, VS3, VS4, VS5, VS6, VS10, VS11, VS15, VS20, VS30 y VS40.

Turnos por puesto:
- VS6, VS10, VS20, VS30 y VS40: Mañana 07:00–15:00 y Tarde 15:00–23:00.
- Puerta, VS1, VS2, VS3, VS4, VS5, VS11 y VS15: Mañana 07:00–15:00, Tarde 15:00–22:00 y Noche 22:00–07:00.

Horas computadas por turno: 8 para 07–15, 8 para 15–23, 7 para 15–22 y 9 para el resto (noche 22–07).

La asignación admite trabajador, puesto, fecha inicial, fecha final opcional (máximo 93 días), turno, rotación automática diaria entre los turnos disponibles y servicio/centro. Se pueden editar asignaciones individuales.

## Cobertura
Vista mensual con navegación entre meses. Calcula porcentaje de turnos cubiertos y huecos por puesto. Permite abrir días pendientes y asignar un vigilante. La cobertura se construye sobre el catálogo de puestos y turnos anterior.

## Incapacidad temporal
El administrador registra trabajador y fechas de inicio/fin. Los días de IT aparecen destacados en rojo y computan 5,20 horas por día. El cálculo Android suma 5,20 horas por día natural dentro del periodo.

## Cuadrante del vigilante
Calendario mensual con turnos M/T/N e IT, detalle diario con puesto, servicio, duración y fichajes. Incluye resumen mensual: horas asignadas + IT, extras por encima de 162 horas, nocturnidad (8 h por turno de noche; 1 h para 15–23) y horas de sábado/domingo.

## Vacaciones
El vigilante puede solicitar un periodo; el administrador revisa solicitudes y acepta/rechaza. En web debe persistirse el estado y la resolución, no sólo mostrar un formulario.

## Fichajes
El Android registra entrada/salida y los consulta por día; los turnos nocturnos pueden finalizar al día siguiente. La web debe validar que un vigilante sólo fiche para su propia cuenta y permitir al administrador consultar registros.

## Nómina
La pantalla Android es una previsión orientativa basada en cuadrantes y condiciones individuales. El propio Android advierte que hay que contrastar bases, importes fijos, festivos oficiales, IT y convenio con una nómina real. No presentar los resultados como nómina oficial.

## Documentación y material
Docs muestra la gestión de TIP/caducidades desde la ficha. Material está expresamente pendiente de conectar a inventario en el APK revisado; no hay flujo de inventario completo que replicar todavía.

## Seguridad y arquitectura
- Nunca incluir Supabase service_role/secret key en JavaScript público ni en el APK.
- La creación de cuentas se hará mediante Supabase Edge Function protegida: validar JWT del usuario que llama, comprobar rol admin activo en profiles y usar el service-role sólo en el entorno de la función.
- RLS se mantiene activado. La UI no es una frontera de seguridad.
- Antes de producción, probar políticas con sesiones reales de administrador y vigilante.
