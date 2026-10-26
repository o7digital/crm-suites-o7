# Conectar tu ChatGPT a Pulse CRM

Estado: servidor publicado; falta terminar la primera conexión de prueba desde ChatGPT antes de declarar validado este recorrido.

1. Abre ChatGPT en la web y entra en **Plugins → + → Add custom MCP server**. Según tu cuenta, esta opción puede estar en **Configuración → Aplicaciones → Configuración avanzada → Modo desarrollador**. Si tu organización no permite servidores personalizados, pide al administrador de ChatGPT que habilite esa función.
2. Introduce estos datos:

   | Campo | Valor |
   |---|---|
   | Nombre | Pulse CRM |
   | Descripción | Consulta y gestiona tu CRM con los permisos de tu cuenta Pulse. |
   | URL del servidor MCP | `https://api.crm.o7digitalgroup.com/api/mcp` |
   | Autenticación | OAuth |
   | Client ID, si aparece | `pulse-chatgpt` |
   | Client secret | Déjalo vacío: cliente público con PKCE S256. |
   | Scopes, si aparece | `pulse:read pulse:write offline_access` |

3. En la página de gestión o detalles del servidor, copia la **Redirect URI / Callback URL** exacta y envíala a Olivier para registrarla. No escribas una dirección supuesta. Si ChatGPT exige un secreto u otro método, informa del campo/error antes de continuar.
4. Cuando Olivier confirme el registro, conecta Pulse. Inicia sesión con **tu propia cuenta Pulse**, comprueba tu correo y tu espacio de trabajo. Para tu uso habitual debe ser **ZEVI CAPITAL**; no uses la cuenta de soporte ni la cuenta de prueba de Olivier.
5. Confirma tu zona horaria real. Marca el permiso de escritura solo si quieres crear o modificar registros. Cada conexión es individual y conserva tus permisos habituales del CRM.
6. En una conversación nueva, escribe `@` y selecciona **Pulse CRM**. Empieza con: «Muéstrame mi identidad, espacio de trabajo y zona horaria». Después busca un contacto real que ya conozcas.
7. Para crear un prospecto con oportunidad y tarea, proporciona los datos reales, importe, moneda, pipeline/etapa y fecha/hora exacta. Confirma la escritura cuando ChatGPT lo solicite. Abre los enlaces devueltos para verificar el resultado en Pulse. No hagas pruebas con datos ficticios en ZEVI CAPITAL.
8. Para quitar el acceso: en Pulse abre **Mi cuenta → Conexiones ChatGPT → Revocar acceso**. El siguiente uso debe exigir una nueva conexión. Quitar el plugin de ChatGPT también evita usarlo allí; la revocación en Pulse invalida sus tokens.

No necesitas una clave API compartida ni la contraseña de otra persona.

Referencia oficial: [Conectar y probar un servidor MCP en ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt) y [OAuth y callback exacta](https://developers.openai.com/plugins/build/auth).
