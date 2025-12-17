/**
 * LPSN BUSES 2026 — Backend Sync (V4, oficial)
 * Pegar en Apps Script (Código.gs) y luego Implementar como "Aplicación web".
 *
 * Script Properties requeridas:
 *  - API_KEY  (ej: LPSN-BUSES2026-KEY-001)
 *  - SHEET_ID (ID del Google Sheet central)
 *
 * Seguridad:
 *  - apiKey obligatorio
 *  - email obligatorio para TODAS las acciones, solo 3 digitadores permitidos
 *
 * Respuestas: el frontend V4 espera { ok:true, ... } con datos en raíz (no en data.*)
 */

const ALLOWED_EMAILS = [
  "belenacuna@liceosannicolas.cl",
  "franciscopinto@liceosannicolas.cl",
  "echeverri@liceosannicolas.cl"
];

const SH = {
  ESTUDIANTES: "Estudiantes",
  BUSES: "Buses",
  ASIGNACIONES: "Asignaciones",
  ESPERA: "En_espera"
};

// Encabezados mínimos recomendados (si faltan, se agregan)
const EST_COLS = ["RUT","NOMBRE","CURSO","DOMICILIO","COMUNA","ZONA","CORREO"];
const BUS_COLS = ["BUS_ID","NOMBRE","RECORRIDO","CAPACIDAD","ACTIVO"];
const ASIG_COLS = ["TS","RUT","NOMBRE","CURSO","DOMICILIO","COMUNA","ZONA","CORREO","BUS_ID","BUS_NOMBRE","RECORRIDO","ESTADO","DIGITADOR","OBS"];
const ESP_COLS  = ["TS","RUT","NOMBRE","CURSO","DOMICILIO","COMUNA","ZONA","CORREO","BUS_ID","BUS_NOMBRE","RECORRIDO","MOTIVO","DIGITADOR","OBS"];

function doGet(e){
  return ContentService.createTextOutput(JSON.stringify({ok:true, msg:"GET OK. Use POST JSON.", ts:new Date().toISOString()}))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e){
  try{
    const body = parseBody_(e);
    const action = String(body.action||"").trim();

    const apiKey = String(body.apiKey ?? body.apikey ?? body.API_KEY ?? body.key ?? "").trim();
    if(!checkApiKey_(apiKey)) return out_(false, null, "API key inválida");

    const email = String(body.email || body.digitador || body.user || "").toLowerCase().trim();
    if(!email) return out_(false, null, "Email requerido");
    if(ALLOWED_EMAILS.indexOf(email) === -1) return out_(false, null, "Correo no autorizado");

    ensureSheets_();

    if(action === "ping"){
      return out_(true, {ts:new Date().toISOString(), email}, null);
    }

    if(action === "listBuses"){
      return out_(true, {buses: listBuses_()}, null);
    }

    if(action === "getStudent"){
      const rut = body.rut || body.RUT;
      const st = findStudent_(rut);
      if(!st) return out_(false, null, "Alumno no encontrado");
      return out_(true, {student: st, status:"OK"}, null);
    }

    if(action === "updateStudent"){
      const rut = body.rut || body.RUT;
      const fields = (body.fields && typeof body.fields === "object") ? body.fields : body;
      const updated = updateStudent_(rut, fields);
      if(!updated.ok) return out_(false, null, updated.error);
      return out_(true, {student: updated.student, message:"Estudiante actualizado."}, null);
    }

    if(action === "assignBus"){
      const rut = body.rut || body.RUT;
      const busId = String(body.busId || body.BUS_ID || "").trim();
      const recorrido = String(body.recorrido || "").trim();
      const obs = String(body.obs || "");
      const digitador = String(body.digitador || email || "").toLowerCase().trim();

      if(!rut) return out_(false, null, "RUT requerido");
      if(!busId) return out_(false, null, "Bus requerido");

      const st = findStudent_(rut);
      if(!st) return out_(false, null, "Alumno no encontrado");

      const bus = getBus_(busId);
      if(!bus) return out_(false, null, "Bus no existe o no está activo");

      const cap = Number(bus.capacidad || 0) || 0;
      const used = currentBusOccupancy_(busId);

      if(cap > 0 && used >= cap){
        appendWait_(st, bus, digitador, obs, "SIN_CUPO");
        return out_(true, {state:"EN_ESPERA", message:"Bus sin cupo. Enviado a En_espera."}, null);
      }

      appendAssign_(st, bus, digitador, obs, "ASIGNADO", recorrido);
      return out_(true, {state:"ASIGNADO", message:"Asignación registrada."}, null);
    }

    if(action === "getBusDashboard"){
      const busId = String(body.busId || "").trim();
      const dash = getBusDashboard_(busId);
      return out_(true, dash, null);
    }

    if(action === "getCursoDashboard"){
      const curso = String(body.curso || "").trim();
      return out_(true, {rows: getCursoRows_(curso)}, null);
    }

    if(action === "uploadStudents"){
      // Herramienta admin: carga por chunks desde tools/importer_sync.html
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if(!rows.length) return out_(false, null, "No hay filas para subir");
      const r = uploadStudents_(rows);
      if(!r.ok) return out_(false, null, r.error);
      return out_(true, {message:"OK", inserted:r.inserted}, null);
    }

    return out_(false, null, "Acción no soportada: " + action);

  }catch(err){
    return out_(false, null, "Error: " + (err && err.message ? err.message : String(err)));
  }
}

/* ========= Helpers ========= */

function props_(k){ return PropertiesService.getScriptProperties().getProperty(k); }
function checkApiKey_(k){
  const expected = String(props_("API_KEY")||"").trim();
  return expected && String(k||"").trim() === expected;
}
function ss_(){
  const id = String(props_("SHEET_ID")||"").trim();
  if(!id) throw new Error("Falta SHEET_ID en Script Properties.");
  return SpreadsheetApp.openById(id);
}
function parseBody_(e){
  const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "{}";
  return JSON.parse(raw);
}
function out_(ok, data, err){
  const payload = ok ? Object.assign({ok:true}, data||{}) : {ok:false, error: err || "Error"};
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
function normRut_(r){
  return String(r||"").toUpperCase().trim().replace(/\s+/g,"").replace(/\./g,"");
}
function headerMap_(row){
  const h = row.map(x=>String(x||"").trim().toUpperCase());
  const m = {};
  h.forEach((v,i)=>{ if(v) m[v]=i; });
  return {h, m};
}
function ensureSheet_(ss, name, cols){
  let sh = ss.getSheetByName(name);
  if(!sh) sh = ss.insertSheet(name);
  const lastCol = sh.getLastColumn();
  const existing = lastCol ? sh.getRange(1,1,1,lastCol).getValues()[0] : [];
  if(existing.filter(String).length === 0){
    sh.getRange(1,1,1,cols.length).setValues([cols]);
    sh.setFrozenRows(1);
  }else{
    // agrega columnas faltantes
    const {m} = headerMap_(existing);
    const missing = cols.filter(c => m[c] === undefined);
    if(missing.length){
      sh.getRange(1, existing.length+1, 1, missing.length).setValues([missing]);
    }
  }
  return sh;
}
function ensureSheets_(){
  const ss = ss_();
  const stSh = findStudentsSheet_() || ensureSheet_(ss, SH.ESTUDIANTES, EST_COLS);
  ensureStudentColumns_(stSh);
  ensureSheet_(ss, SH.BUSES, BUS_COLS);
  ensureSheet_(ss, SH.ASIGNACIONES, ASIG_COLS);
  ensureSheet_(ss, SH.ESPERA, ESP_COLS);
}

/**
 * Auto-detección de la hoja de estudiantes:
 * - No depende del nombre (Externos/Estudiantes/etc.)
 * - Busca una pestaña cuya fila 1 contenga al menos "RUT" y otros campos comunes.
 */
function findStudentsSheet_(){
  const ss = ss_();
  const sheets = ss.getSheets();
  const mustHave = ["RUT"];
  const niceToHave = ["NOMBRE","CURSO","EMAIL","CORREO","DOMICILIO","COMUNA","ZONA"];

  let best = null;
  let bestScore = -1;

  for(const sh of sheets){
    const lastCol = sh.getLastColumn();
    if(lastCol < 1) continue;

    const headerRow = sh.getRange(1,1,1,Math.min(lastCol,50)).getValues()[0]
      .map(h => String(h).trim().toUpperCase())
      .filter(Boolean);

    const hasMust = mustHave.every(h => headerRow.indexOf(h) !== -1);
    if(!hasMust) continue;

    const score = niceToHave.reduce((acc, h) => acc + (headerRow.indexOf(h) !== -1 ? 1 : 0), 0);
    if(score > bestScore){
      best = sh;
      bestScore = score;
    }
  }
  return best;
}

function getStudentsSheet_(){
  const ss = ss_();
  return findStudentsSheet_() || ss.getSheetByName(SH.ESTUDIANTES) || ensureSheet_(ss, SH.ESTUDIANTES, EST_COLS);
}

// Asegura encabezados mínimos y columnas faltantes (sin duplicar EMAIL/CORREO).
function ensureStudentColumns_(sh){
  const lastCol = sh.getLastColumn();
  const headerRow = lastCol ? sh.getRange(1,1,1,lastCol).getValues()[0] : [];
  const header = headerRow.map(h => String(h).trim().toUpperCase());

  // Si la hoja está vacía (sin headers), setear headers estándar
  const nonEmpty = headerRow.filter(v => String(v||"").trim() !== "").length;
  if(nonEmpty === 0){
    sh.getRange(1,1,1,EST_COLS.length).setValues([EST_COLS]);
    sh.setFrozenRows(1);
    return;
  }

  const set = new Set(header.filter(Boolean));

  // Si existe EMAIL, considerarlo equivalente a CORREO (para no duplicar).
  const hasEmail = set.has("EMAIL") || set.has("MAIL");
  const missing = EST_COLS.filter(c => {
    if(c === "CORREO" && hasEmail) return false;
    return !set.has(c);
  });

  if(missing.length > 0){
    sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
    sh.setFrozenRows(1);
  }
}


/* ========= Students ========= */

function findStudent_(rut){
  const ss = ss_();
  const sh = getStudentsSheet_();
  const values = sh.getDataRange().getValues();
  if(values.length < 2) return null;
  const {h, m} = headerMap_(values[0]);
  // Alias: si la hoja usa EMAIL en vez de CORREO
  if(m[\"CORREO\"] === undefined && m[\"EMAIL\"] !== undefined) m[\"CORREO\"] = m[\"EMAIL\"];
  if(m[\"CORREO\"] === undefined && m[\"MAIL\"] !== undefined) m[\"CORREO\"] = m[\"MAIL\"];
  const idxRut = m["RUT"];
  if(idxRut === undefined) return null;
  const target = normRut_(rut);

  for(let i=1;i<values.length;i++){
    const row = values[i];
    if(normRut_(row[idxRut]) === target){
      return toStudentObj_(h, row);
    }
  }
  return null;
}

function toStudentObj_(h, row){
  const get = (...keys)=>{
    for(const k of keys){
      const idx = h.indexOf(k);
      if(idx !== -1) return row[idx];
    }
    return "";
  };

  // NOMBRE: si no existe, intenta componer
  let nombre = get("NOMBRE","NOMBRE_COMPLETO","NOMBRE COMPLETO");
  if(!nombre){
    const ap = get("APELLIDO_PATERNO","APELLIDO PATERNO","APELLIDO_P");
    const am = get("APELLIDO_MATERNO","APELLIDO MATERNO","APELLIDO_M");
    const nom = get("NOMBRES","NOMBRE(S)","NOMBRE");
    nombre = String(nom||"").trim() + (ap||am ? " " + String(ap||"").trim() + " " + String(am||"").trim() : "");
    nombre = nombre.replace(/\s+/g," ").trim();
  }

  return {
    rut: normRut_(get("RUT")),
    nombre: String(nombre||"").trim(),
    curso: String(get("CURSO","CURSO 2026","NIVEL")||"").trim(),
    domicilio: String(get("DOMICILIO","DIRECCION","DIRECCIÓN","DIRECCION DOMICILIO")||"").trim(),
    comuna: String(get("COMUNA")||"").trim(),
    zona: String(get("ZONA","SECTOR")||"").trim(),
    email: String(get("CORREO","EMAIL","MAIL")||"").trim()
  };
}

function updateStudent_(rut, fields){
  const ss = ss_();
  const sh = getStudentsSheet_();
  const values = sh.getDataRange().getValues();
  if(values.length < 2) return {ok:false, error:"Hoja Estudiantes vacía"};

  const {h, m} = headerMap_(values[0]);
  // Alias: si la hoja usa EMAIL en vez de CORREO
  if(m["CORREO"] === undefined && m["EMAIL"] !== undefined) m["CORREO"] = m["EMAIL"];
  if(m["CORREO"] === undefined && m["MAIL"] !== undefined) m["CORREO"] = m["MAIL"];

  const idxRut = m["RUT"];
  if(idxRut === undefined) return {ok:false, error:"No existe columna RUT"};

  const target = normRut_(rut);
  let rowIndex = -1;
  for(let i=1;i<values.length;i++){
    if(normRut_(values[i][idxRut]) === target){ rowIndex = i+1; break; }
  }
  if(rowIndex === -1) return {ok:false, error:"Alumno no encontrado"};

  const mapField = (name)=> fields[name] ?? fields[name.toLowerCase()] ?? fields[name[0]+name.slice(1).toLowerCase()] ?? "";

  const setIfSent = (colName, v)=>{
    const idx = m[colName];
    if(idx === undefined) return;
    const hasKey =
      Object.prototype.hasOwnProperty.call(fields, colName) ||
      Object.prototype.hasOwnProperty.call(fields, colName.toLowerCase()) ||
      Object.prototype.hasOwnProperty.call(fields, colName[0]+colName.slice(1).toLowerCase());
    if(hasKey) sh.getRange(rowIndex, idx+1).setValue(v);
  };

  setIfSent("NOMBRE", mapField("NOMBRE") || mapField("nombre"));
  setIfSent("CURSO", mapField("CURSO") || mapField("curso"));
  setIfSent("DOMICILIO", mapField("DOMICILIO") || mapField("domicilio"));
  setIfSent("COMUNA", mapField("COMUNA") || mapField("comuna"));
  setIfSent("ZONA", mapField("ZONA") || mapField("zona"));
  setIfSent("CORREO", mapField("CORREO") || mapField("email") || mapField("correo"));

  // devolver estudiante actualizado
  const st = findStudent_(rut);
  return {ok:true, student: st};
}

/* ========= Buses ========= */

function listBuses_(){
  const ss = ss_();
  const sh = ss.getSheetByName(SH.BUSES);
  const values = sh.getDataRange().getValues();
  if(values.length < 2) return [];
  const {h, m} = headerMap_(values[0]);

  const out = [];
  for(let i=1;i<values.length;i++){
    const row = values[i];
    const id = String(row[m["BUS_ID"]] ?? row[m["ID"]] ?? "").trim();
    if(!id) continue;
    const activo = String(row[m["ACTIVO"]] ?? "SI").toUpperCase().trim();
    if(["NO","0","FALSE"].indexOf(activo) !== -1) continue;

    out.push({
      id,
      nombre: row[m["NOMBRE"]] || ("Bus " + id),
      recorrido: row[m["RECORRIDO"]] || "",
      capacidad: Number(row[m["CAPACIDAD"]] || 0) || 0
    });
  }
  return out;
}

function getBus_(busId){
  const id = String(busId||"").trim();
  return listBuses_().find(b=>String(b.id)===id) || null;
}

/* ========= Asignación / Espera ========= */

function appendAssign_(st, bus, digitador, obs, estado, recorridoOverride){
  const ss = ss_();
  const sh = ss.getSheetByName(SH.ASIGNACIONES);
  const now = new Date().toISOString();
  sh.appendRow([
    now,
    normRut_(st.rut),
    st.nombre,
    st.curso,
    st.domicilio,
    st.comuna,
    st.zona,
    st.email,
    bus.id,
    bus.nombre,
    (recorridoOverride || bus.recorrido || ""),
    estado,
    digitador,
    obs
  ]);
}

function appendWait_(st, bus, digitador, obs, motivo){
  const ss = ss_();
  const sh = ss.getSheetByName(SH.ESPERA);
  const now = new Date().toISOString();
  sh.appendRow([
    now,
    normRut_(st.rut),
    st.nombre,
    st.curso,
    st.domicilio,
    st.comuna,
    st.zona,
    st.email,
    bus.id,
    bus.nombre,
    bus.recorrido || "",
    motivo,
    digitador,
    obs
  ]);
}

function currentBusOccupancy_(busId){
  // Cuenta asignaciones vigentes: última acción por RUT en Asignaciones
  const ss = ss_();
  const sh = ss.getSheetByName(SH.ASIGNACIONES);
  const values = sh.getDataRange().getValues();
  if(values.length < 2) return 0;
  const {h, m} = headerMap_(values[0]);

  const idxRut = m["RUT"], idxBus = m["BUS_ID"], idxEstado = m["ESTADO"], idxTs = m["TS"];
  if([idxRut, idxBus, idxEstado, idxTs].some(v=>v===undefined)) return 0;

  const last = new Map(); // rut -> {ts,row}
  for(let i=1;i<values.length;i++){
    const row = values[i];
    const r = normRut_(row[idxRut]);
    if(!r) continue;
    const ts = new Date(String(row[idxTs]||""));
    const prev = last.get(r);
    if(!prev || ts > prev.ts) last.set(r, {ts, row});
  }

  let count = 0;
  for(const v of last.values()){
    const row = v.row;
    const b = String(row[idxBus]||"").trim();
    const estado = String(row[idxEstado]||"").toUpperCase().trim();
    if(b === String(busId).trim() && estado === "ASIGNADO") count++;
  }
  return count;
}

/* ========= Dashboards ========= */

function getBusDashboard_(busId){
  const bus = getBus_(busId);
  if(!bus) return {bus:{id:busId, nombre:"(No existe)"}, asignados:[], enEspera:[]};

  const asignados = currentAssignedRowsForBus_(bus.id);
  const enEspera = waitRowsForBus_(bus.id);
  return { bus, asignados, enEspera };
}

function currentAssignedRowsForBus_(busId){
  const ss = ss_();
  const sh = ss.getSheetByName(SH.ASIGNACIONES);
  const values = sh.getDataRange().getValues();
  if(values.length < 2) return [];

  const {h, m} = headerMap_(values[0]);
  const idxRut = m["RUT"], idxBus = m["BUS_ID"], idxEstado = m["ESTADO"], idxTs = m["TS"];
  if([idxRut, idxBus, idxEstado, idxTs].some(v=>v===undefined)) return [];

  const last = new Map();
  for(let i=1;i<values.length;i++){
    const row = values[i];
    const r = normRut_(row[idxRut]);
    if(!r) continue;
    const ts = new Date(String(row[idxTs]||""));
    const prev = last.get(r);
    if(!prev || ts > prev.ts) last.set(r, {ts, row});
  }

  const out = [];
  for(const v of last.values()){
    const row = v.row;
    const b = String(row[idxBus]||"").trim();
    const estado = String(row[idxEstado]||"").toUpperCase().trim();
    if(b === String(busId).trim() && estado === "ASIGNADO"){
      out.push(rowToObj_(h, row));
    }
  }
  // orden por TS asc
  out.sort((a,b)=> String(a.TS||"").localeCompare(String(b.TS||"")));
  return out;
}

function waitRowsForBus_(busId){
  const ss = ss_();
  const sh = ss.getSheetByName(SH.ESPERA);
  const values = sh.getDataRange().getValues();
  if(values.length < 2) return [];
  const {h, m} = headerMap_(values[0]);
  const idxBus = m["BUS_ID"];
  const out = [];
  for(let i=1;i<values.length;i++){
    const row = values[i];
    const b = String(row[idxBus]||"").trim();
    if(b === String(busId).trim()) out.push(rowToObj_(h, row));
  }
  return out;
}

function getCursoRows_(curso){
  const c = String(curso||"").trim().toUpperCase();
  const ss = ss_();
  const sh = ss.getSheetByName(SH.ASIGNACIONES);
  const values = sh.getDataRange().getValues();
  if(values.length < 2) return [];

  const {h, m} = headerMap_(values[0]);
  const idxRut = m["RUT"], idxCurso = m["CURSO"], idxTs = m["TS"];
  if([idxRut, idxCurso, idxTs].some(v=>v===undefined)) return [];

  // última fila por rut, filtrada por curso (si curso vacío, trae todos)
  const last = new Map();
  for(let i=1;i<values.length;i++){
    const row = values[i];
    const rowCurso = String(row[idxCurso]||"").trim().toUpperCase();
    if(c && rowCurso !== c) continue;

    const r = normRut_(row[idxRut]);
    if(!r) continue;

    const ts = new Date(String(row[idxTs]||""));
    const prev = last.get(r);
    if(!prev || ts > prev.ts) last.set(r, {ts, obj: rowToObj_(h, row)});
  }

  return Array.from(last.values()).sort((a,b)=>a.ts-b.ts).map(x=>x.obj);
}

function rowToObj_(header, row){
  const o = {};
  for(let i=0;i<header.length;i++){
    const k = String(header[i]||"").trim();
    if(!k) continue;
    o[k] = row[i];
  }
  return o;
}

/* ========= Upload tool ========= */

function uploadStudents_(rows){
  try{
    const ss = ss_();
    const sh = getStudentsSheet_();

    // map headers
    const header = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(x=>String(x||"").trim().toUpperCase());
    const map = {};
    header.forEach((h,i)=>{ if(h) map[h]=i; });

    let inserted = 0;

    rows.forEach(r=>{
      const rut = normRut_(r.RUT || r.Rut || r.rut || r["Rut Alumno"] || r["RUT ALUMNO"] || "");
      if(!rut) return;

      // evitar duplicados: si existe, se omite
      if(studentExists_(sh, map, rut)) return;

      const nombre = String(r.NOMBRE || r.Nombre || r["NOMBRE_COMPLETO"] || r["Nombre Completo"] || "").trim();
      const curso  = String(r.CURSO || r.Curso || r["CURSO 2026"] || "").trim();
      const domicilio = String(r.DOMICILIO || r.Direccion || r["DIRECCIÓN"] || "").trim();
      const comuna = String(r.COMUNA || "").trim();
      const zona = String(r.ZONA || r.SECTOR || "").trim();
      const correo = String(r.CORREO || r.EMAIL || r.Mail || "").trim();

      const rowOut = new Array(header.length).fill("");
      rowOut[map["RUT"]] = rut;
      if(map["NOMBRE"] !== undefined) rowOut[map["NOMBRE"]] = nombre;
      if(map["CURSO"] !== undefined) rowOut[map["CURSO"]] = curso;
      if(map["DOMICILIO"] !== undefined) rowOut[map["DOMICILIO"]] = domicilio;
      if(map["COMUNA"] !== undefined) rowOut[map["COMUNA"]] = comuna;
      if(map["ZONA"] !== undefined) rowOut[map["ZONA"]] = zona;
      if(map["CORREO"] !== undefined) rowOut[map["CORREO"]] = correo;

      sh.appendRow(rowOut);
      inserted++;
    });

    return {ok:true, inserted};

  }catch(err){
    return {ok:false, error: (err && err.message ? err.message : String(err))};
  }
}

function studentExists_(sh, map, rut){
  const idxRut = map["RUT"];
  if(idxRut === undefined) return false;
  const lastRow = sh.getLastRow();
  if(lastRow < 2) return false;
  const ruts = sh.getRange(2, idxRut+1, lastRow-1, 1).getValues().map(x=>normRut_(x[0]));
  return ruts.indexOf(normRut_(rut)) !== -1;
}
