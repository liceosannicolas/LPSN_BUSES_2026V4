# Mejora V4 — Modificar estudiante desde dashboard

## Qué se agregó
- Botón **“✏️ Modificar estudiante”** en `app/dashboard.html` para editar/completar datos del alumno (domicilio, comuna, zona, correo, curso y nombre).
- Nueva acción de backend **`updateStudent`** en Apps Script para guardar los cambios en Google Sheets (hoja **Estudiantes**).

## Requisito (backend)
Para que el botón guarde en la planilla, debes **actualizar tu Apps Script** con el archivo incluido en:
- `backend/AppsScript.gs`

### Pasos rápidos
1. Abre tu proyecto Apps Script.
2. Reemplaza el contenido de `Código.gs` por el contenido de `backend/AppsScript.gs`.
3. Verifica Script Properties:
   - `API_KEY` (igual a tu sitio)
   - `SHEET_ID` (ID de tu planilla central)
4. **Implementar → Administrar implementaciones → Editar → Implementar** (re-deploy).

## Cómo se usa (digitador)
1. Buscar por RUT.
2. Click **✏️ Modificar estudiante**.
3. Completar campos.
4. Click **💾 Guardar cambios**.
