# Manual de usuario - o7 PulseCRM

## 1. Introduccion

o7 PulseCRM es un CRM multi-tenant para gestionar clientes, tareas, oportunidades comerciales, post-venta, previsiones y administracion del workspace.

Este manual esta basado en las funciones realmente disponibles en la aplicacion en marzo de 2026. No describe modulos no operativos como si ya estuvieran terminados.

## 2. Acceso al sistema

### Iniciar sesion

1. Abre la pagina de acceso.
2. Introduce tu correo electronico y tu contrasena.
3. Haz clic en **Sign in**.

### Crear una cuenta o unirte a un workspace

Existen dos formas:

- Crear un workspace nuevo desde la pagina de registro.
- Unirte a un workspace existente mediante un enlace de invitacion generado por un administrador.

Si entras con un enlace de invitacion, algunos campos del workspace pueden venir prellenados o bloqueados.

## 3. Navegacion principal

La barra superior incluye las siguientes secciones:

- `Dashboard`
- `Clients`
- `Tasks`
- `CRM`
- `Post-Sales`
- `Orders`
- `o7 IA Pulse`
- `Forecast`
- `Export`
- `Admin`
- `My Account`

No todos los usuarios tienen el mismo nivel de acceso. Algunas funciones son solo para administradores o propietarios del workspace.

## 4. Dashboard

El dashboard muestra una vista rapida de la actividad del workspace:

- Numero total de clientes.
- Tareas abiertas.
- Leads abiertos y totales.
- Valor del pipeline abierto en USD.
- Lista de tareas por estado.
- Facturas recientes.

Uso recomendado:

1. Revisar el pipeline abierto al empezar el dia.
2. Comprobar tareas pendientes.
3. Verificar si hay facturas recientes o incidencias de conversion de moneda.

## 5. Gestion de clientes

La seccion `Clients` sirve para crear, consultar, modificar, importar y exportar clientes.

### Datos disponibles por cliente

Un cliente puede incluir:

- Nombre
- Nombre de pila
- Funcion o cargo
- Sector de empresa
- Correo electronico
- Telefono
- Empresa
- Sitio web
- Direccion
- Tax ID / RFC
- Notas

### Acciones principales

- Crear un cliente manualmente.
- Editar la ficha completa de un cliente.
- Eliminar un cliente.
- Importar clientes desde CSV.
- Exportar clientes a CSV.

### Recomendaciones

- Completa el correo electronico y la empresa para aprovechar mejor newsletters, contratos e IA Pulse.
- Usa el sector de empresa para segmentaciones futuras.

## 6. Tareas

La seccion `Tasks` permite gestionar tareas operativas asociadas a clientes.

### Campos principales de una tarea

- Titulo
- Cliente asociado
- Fecha de vencimiento
- Importe opcional
- Moneda
- Estado

### Estados disponibles

- `PENDING`
- `IN_PROGRESS`
- `DONE`

### Acciones principales

- Crear una tarea.
- Cambiar el estado.
- Eliminar la tarea.
- Enviar la tarea al calendario cuando la integracion Google Calendar este conectada.

## 7. CRM

La seccion `CRM` es el nucleo comercial para gestionar pipelines, etapas y deals.

### Conceptos clave

- **Pipeline**: flujo comercial completo.
- **Stage**: etapa dentro de un pipeline.
- **Deal**: oportunidad comercial.

### Datos principales de un deal

- Titulo
- Valor
- Moneda
- Fecha estimada de cierre
- Cliente
- Productos asociados
- Pipeline
- Etapa

### Acciones principales

- Crear un deal.
- Editar un deal.
- Arrastrar un deal entre etapas.
- Crear un cliente rapido desde el propio CRM.
- Asociar productos al deal.
- Gestionar el workflow del pipeline.

### Gestion del workflow

Desde `Manage Workflow` puedes:

- Renombrar etapas.
- Cambiar el estado de una etapa a `OPEN`, `WON` o `LOST`.
- Ajustar la probabilidad de cierre.
- Anadir nuevas etapas.

Nota: las etapas y probabilidades impactan directamente la seccion `Forecast`.

## 8. Post-Sales

La seccion `Post-Sales` reutiliza las tareas para seguimiento operativo despues de la venta.

### Funciones actuales

- Vista por periodo.
- Agenda mensual, semanal o personalizada.
- Tareas agrupadas por fecha.
- Guardado de horas invertidas por tarea.
- Cambio de estado.
- Eliminacion de tareas.
- Acciones de calendario sobre tareas con fecha.

Uso recomendado:

1. Crear tareas de implantacion, soporte o seguimiento.
2. Asignar fechas de vencimiento.
3. Registrar horas consumidas.
4. Revisar cada periodo desde la agenda.

## 9. Orders

La seccion `Orders` centraliza pedidos, deals e informacion de facturacion.

### Funciones disponibles

- Visualizar deals recientes.
- Ver facturas cargadas en el sistema.
- Analizar exposicion por moneda.
- Exportar la tabla a CSV.
- Importar deals desde CSV.

Esta seccion es util para control operativo y para consolidar datos de ventas e invoices.

## 10. Forecast

La seccion `Forecast` calcula la previson comercial por pipeline.

### Informacion mostrada

- Total del pipeline.
- Total ponderado por probabilidad.
- Tabla por etapa con estado, numero de deals, probabilidad, total y total ponderado.

Puedes cambiar de pipeline desde el selector superior.

## 11. Export

La seccion `Export` permite descargar archivos CSV de:

- Clientes
- Facturas

Uso recomendado:

- Exportar clientes para trabajo externo o respaldo.
- Exportar facturas para conciliacion o reporting financiero.

## 12. o7 IA Pulse

`o7 IA Pulse` es una capa de asistencia inteligente sobre el CRM.

### Funciones reales disponibles

- Analisis de leads del CRM.
- Resumen de contexto comercial.
- Generacion de correos de seguimiento.
- Generacion de mensajes listos para WhatsApp.
- Recomendaciones de siguiente accion.
- Recomendacion de etapa.
- Aplicacion de la etapa sugerida al deal.
- Carga de contratos para extraer campos del cliente cuando la configuracion de placeholders esta preparada.

### Requisitos para aprovecharlo bien

- El deal debe existir en CRM.
- El cliente debe tener datos suficientemente completos.
- Para extraccion de contrato, primero hay que configurar el mapeo en `Admin > Parameters > Customers`.

## 13. Mi cuenta

En `My Account` el usuario puede acceder a:

- `My Information`
- `Company Detail`
- `Adjustments`

### My Information

Muestra:

- Nombre del usuario
- Correo electronico

### Adjustments

Permite:

- Cambiar el idioma de la interfaz.
- Cambiar logo del tenant.
- Cambiar colores del CRM:
  - Fondo
  - Shell
  - Tarjetas
  - Texto principal
  - Texto secundario
  - Accent principal
  - Accent secundario

### Idiomas soportados actualmente

- Ingles
- Frances
- Espanol

Nota:

En la rama `main` actual, estas son las 3 lenguas realmente traducidas de forma completa en la interfaz. Otras lenguas llegaron a mostrarse temporalmente en el selector, pero sin traduccion integral; por eso se retiraron para no prometer soporte falso.

### Company Detail

Esta pagina existe, pero de momento esta en estado base. La intencion es guardar datos de empresa, direccion, identificadores fiscales y correos de facturacion, pero esa parte aun no esta terminada.

## 14. Administracion del workspace

La seccion `Admin` agrupa la configuracion del workspace.

### 14.1 Users

Permite:

- Ver usuarios del workspace.
- Invitar nuevos usuarios.
- Generar enlaces de invitacion.
- Cambiar roles.
- Revocar invitaciones pendientes.

### Roles existentes

- `OWNER`
- `ADMIN`
- `MEMBER`

### 14.2 Parameters

Contiene tres submodulos:

- `Customers`
- `CRM`
- `Products`

#### Customers

Actualmente se usa para configurar la extraccion de datos de contratos:

- Seleccionar una plantilla contractual.
- Detectar placeholders `{{...}}`.
- Mapear cada placeholder a un campo del cliente.

#### CRM

Permite configurar:

- Modo del CRM: `B2B` o `B2C`
- Moneda de visualizacion por defecto
- Industria del workspace

#### Products

Permite:

- Crear productos.
- Definir precio y moneda.
- Activar o desactivar productos.
- Editarlos o eliminarlos.

Los productos se pueden usar despues dentro de los deals del CRM.

### 14.3 Calendar sync

Permite conectar Google Calendar para el usuario administrador actual.

### Funciones disponibles

- Conectar cuenta Google por OAuth.
- Lanzar sincronizacion manual.
- Desconectar la cuenta.
- Ver ultimo estado de sincronizacion.

### Comportamiento

Las tareas del CRM con fecha se envian como eventos de dia completo.

### 14.4 OCR - Scan

Permite:

- Subir una factura o documento.
- Asociarlo opcionalmente a un cliente.
- Definir o corregir importe y moneda.
- Revisar facturas procesadas.

### 14.5 Subscriptions

Este modulo existe para gestionar subscriptions y workspaces cliente.

Permite, segun contexto:

- Crear suscripciones.
- Gestionar seats.
- Preparar invitaciones.
- Trabajar con plan, industria y modo CRM.

Este modulo tiene mas sentido en un entorno de administracion de tenants y no siempre esta visible para workspaces cliente.

### 14.6 Benchmarking

Esta seccion sirve para preparar newsletters y comparar proveedores de marketing.

### Funciones actuales

- Configurar proveedor:
  - `SMTP`
  - `Mailcow`
  - `Mailchimp`
  - `Brevo`
- Construir audiencias a partir de clientes reales del CRM.
- Filtrar por sector o seleccion manual.
- Exportar audiencia a CSV.
- Redactar newsletter con placeholders.
- Enviar correo de prueba.
- Enviar campaña.

### Importante

- El envio directo desde el CRM funciona actualmente con `SMTP` y `Mailcow`.
- `Mailchimp` y `Brevo` pueden guardarse como configuracion y servir para benchmarking o exportacion de audiencia, pero no deben considerarse como integraciones de envio plenamente terminadas salvo nueva implementacion.

### 14.7 Reporting

Muestra reporting operativo a partir de tareas y horas registradas.

### Analisis disponibles

- Resumen por periodo.
- Horas totales.
- Numero de tareas.
- Clientes activos.
- Dias activos.
- Vista por cliente.
- Vista por tarea.
- Vista por periodo y cliente.

### 14.8 Mail Integration

La pagina `Mail Integration` existe en el menu admin, pero hoy sigue en estado planned/foundation.

Conviene considerarla como base de integracion futura, no como modulo terminado de sincronizacion de buzones.

### 14.9 Objectives

Permite definir objetivos de venta por vendedor y por mes.

### Datos configurables por usuario

- Equipo o segmento
- Objetivo de leads
- Objetivo de meetings
- Objetivo de pipeline en USD
- Objetivo de cerrado ganado en USD
- Objetivo de win rate

### Importante

Actualmente esta informacion se guarda en el navegador del usuario por tenant y por cuenta. Sirve como tablero operativo local, no como modulo ya conectado a API de persistencia central.

### 14.10 Contracts

Ofrece un pack de plantillas contractuales en:

- Frances
- Ingles
- Espanol

Funciones disponibles:

- Abrir plantilla.
- Descargar plantilla.
- Generar PDF desde la plantilla.
- Ver placeholders principales.

## 15. Buenas practicas de uso

1. Configura primero `Admin > Parameters > CRM` y `Admin > Parameters > Products`.
2. Crea y limpia la base de clientes antes de cargar mas deals.
3. Usa tareas con fecha para sacar provecho del calendario y del post-venta.
4. Define bien probabilidades y estados del workflow para que `Forecast` sea util.
5. Si vas a usar IA Pulse, completa bien correo, empresa, notas y contexto del deal.
6. Antes de campañas de newsletter, verifica correos y sectores en la ficha del cliente.

## 16. Limitaciones actuales que conviene conocer

- Solo hay traduccion completa para ingles, frances y espanol.
- `Company Detail` aun no esta terminado.
- `Mail Integration` como pagina dedicada sigue en estado planned/foundation.
- `Objectives` usa persistencia local en navegador.
- `Mailchimp` y `Brevo` no deben presentarse como envio directo finalizado sin desarrollos adicionales.

## 17. Flujo recomendado de implantacion

1. Crear o unirse al workspace.
2. Ajustar idioma y branding en `My Account > Adjustments`.
3. Configurar `Admin > Parameters > CRM`.
4. Crear productos en `Admin > Parameters > Products`.
5. Invitar usuarios desde `Admin > Users`.
6. Importar o crear clientes.
7. Crear tareas y deals.
8. Ajustar workflow comercial.
9. Revisar `Forecast`.
10. Activar OCR, calendario y newsletters segun necesidad.

## 18. Soporte interno

Si una accion no produce resultado visible, revisa primero:

- Si el usuario tiene permisos suficientes.
- Si el cliente, producto o pipeline existe realmente.
- Si hay campos obligatorios vacios.
- Si la integracion externa requiere credenciales o variables de entorno.

Para incidencias funcionales, conviene registrar:

- Pagina exacta.
- Accion realizada.
- Mensaje de error.
- Fecha y hora.
- Usuario afectado.
