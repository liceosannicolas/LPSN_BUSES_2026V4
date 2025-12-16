# Transporte Escolar — v3 (Sync oficial)

## Objetivo
- Digitador escribe el **RUT**
- El sistema trae la ficha desde `Estudiantes`
- Selecciona `BusID` + `Recorrido`
- Guarda centralizado y además crea/actualiza la **hoja del bus**: `BUS_<ID>`

## Hojas (se crean automáticamente)
- Estudiantes
- Buses
- Asignaciones
- En_espera
- BUS_<ID>

## Apps Script (setup)
1. Crea un Google Sheet (vacío o existente).
2. Extensiones → Apps Script → pega `backend/AppsScript.gs`.
3. En Apps Script → Project Settings → Script Properties:
   - API_KEY = tu clave (ej: NEOTECH-TRANSPORTE-2026-XXXX)
4. Deploy → New deployment → Web app:
   - Execute as: Me
   - Who has access: Anyone with the link
5. Copia la URL `/exec`.

## Sitio
- En `app/settings.html` pega URL + API key.
- Carga nómina: `tools/importer_sync.html`.
- Administra buses desde la hoja `Buses` (manual, por ahora):
  - BusID | Nombre | Recorrido | Capacidad

## Cupos y rezagados
Si el bus alcanza la capacidad, la asignación queda:
- En `En_espera` (y el estado también se refleja en `Asignaciones` como EN_ESPERA).

## Nota
El login del sitio es **local** (UX). La protección real es:
- API key en Apps Script
- Lista de correos permitidos (ALLOWED_EMAILS).
