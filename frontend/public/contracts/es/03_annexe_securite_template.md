# ANEXO 2 - MEDIDAS DE SEGURIDAD (PLANTILLA)

Fecha: {{security_annex_date}}

## 1. Gobernanza de seguridad
- politica de seguridad documentada
- revisiones periodicas de accesos
- registro de acciones administrativas

## 2. Control de acceso
- MFA recomendado
- control por roles (OWNER / ADMIN / MEMBER)
- principio de minimo privilegio

## 3. Cifrado
- en transito: TLS 1.2+
- en reposo: cifrado de almacenamiento cuando aplique
- gestion de secretos fuera del codigo fuente

## 4. Disponibilidad y continuidad
- frecuencia backup: {{backup_frequency}}
- frecuencia pruebas de restauracion: {{restore_test_frequency}}
- monitoreo y alertas

## 5. Seguridad de aplicacion
- validacion de entradas
- autorizacion server-side
- remediacion de vulnerabilidades

## 6. Trazabilidad y logs
- logs de acceso y errores
- operaciones criticas con marca temporal
- retencion de logs: {{log_retention_period}}

## 7. Gestion de incidentes
- deteccion, clasificacion, remediacion
- notificacion al Cliente cuando corresponda
- acciones correctivas post-incidente

## 8. Recursos humanos
- compromisos de confidencialidad
- formacion periodica en seguridad

## 9. Subencargados
- due diligence de seguridad
- obligaciones contractuales de seguridad

## 10. Mejora continua
- revision anual de controles
- ajustes segun riesgo y estado del arte

Referencias:
- RPO: {{rpo_target}}
- RTO: {{rto_target}}
- ventana de mantenimiento: {{maintenance_window}}
