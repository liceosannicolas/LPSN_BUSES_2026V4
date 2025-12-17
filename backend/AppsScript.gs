/**
 * Transporte Escolar Sync (Apps Script)
 * POST JSON: {action, apiKey, ...}
 */
const ALLOWED_EMAILS = [
  "belenacuna@liceosannicolas.cl",
  "franciscopinto@liceosannicolas.cl",
  "echeverri@liceosannicolas.cl"
];

function doPost(e){
  try{
    const body = JSON.parse((e.postData && e.postData.contents) ? e.postData.contents : "{}");
    const action = body.action || "";
    const apiKey = body.apiKey || "";

    if(!checkApiKey_(apiKey)) return json_(false, null, "API key inválida.");
    if(body.email){
      const em = String(body.email).toLowerCase().trim();
      if(ALLOWED_EMAILS.indexOf(em) === -1) return json_(false, null, "Correo no autorizado.");
    }

    ensureCoreSheets_();

    if(action === "ping") return json_(true, {ts: new Date().toISOString()});
    if(action === "uploadStudents") return uploadStudents_(body.rows || []);
    if(action === "listBuses") return listBuses_();
    if(action === "getStudent") return getStudent_(body.rut);
    if(action === "updateStudent") return updateStudent_(body);
    if(action === "assignBus") return assignBus_(body);
    if(action === "getBusDashboard") return getBusDashboard_(body.busId);
    if(action === "getCursoDashboard") return getCursoDashboard_(body.curso);

    return json_(false, null, "Acción no soportada: " + action);
  }catch(err){
    return json_(false, null, String(err && err.message ? err.message : err));
  }
}

function checkApiKey_(k){
  const prop = PropertiesService.getScriptProperties().getProperty("API_KEY") || "";
  return prop && k && String(k) === String(prop);
}

function ss_(){ return SpreadsheetApp.getActiveSpreadsheet(); }

function ensureCoreSheets_(){
  const names = ["Estudiantes","Buses","Asignaciones","En_espera"];
  const ss = ss_();
  names.forEach(n=>{
    if(!ss.getSheetByName(n)){
      const sh = ss.insertSheet(n);
      if(n==="Estudiantes") sh.appendRow(["RUT","Nombre","Curso","Domicilio","Comuna","Email","Zona"]);
      if(n==="Buses") sh.appendRow(["BusID","Nombre","Recorrido","Capacidad","Zonas"]);
      if(n==="Asignaciones") sh.appendRow(["Timestamp","RUT","Nombre","Curso","Email","Comuna","Domicilio","BusID","Recorrido","Estado","Digitador"]);
      if(n==="En_espera") sh.appendRow(["Timestamp","RUT","Nombre","Curso","Email","Comuna","Domicilio","BusID","Recorrido","Estado","Digitador","Motivo"]);
    }
  });
}

function normRut_(v){
  return String(v||"").toUpperCase().replace(/\s+/g,"").replace(/\./g,"");
}
function headerMap_(header){
  const map = {};
  header.forEach((h,i)=> map[String(h).trim().toLowerCase()] = i);
  return map;
}
function findHeaderIndex_(map, candidates){
  for(var i=0;i<candidates.length;i++){
    var k = String(candidates[i]).toLowerCase();
    if(map.hasOwnProperty(k)) return map[k];
  }
  return -1;
}

function uploadStudents_(rows){
  if(!rows || !rows.length) return json_(true, {inserted:0, updated:0});
  const ss = ss_();
  const sh = ss.getSheetByName("Estudiantes");
  const data = sh.getDataRange().getValues();
  const header = data[0];
  const hm = headerMap_(header);

  // existing ruts
  const existing = {};
  for(var r=1;r<data.length;r++){
    existing[normRut_(data[r][0])] = r+1;
  }

  var inserted=0, updated=0;
  rows.forEach(obj=>{
    var rut = normRut_(obj["RUT"] || obj["Rut"] || obj["rut"] || obj["RUN"] || obj["Run"] || obj["run"]);
    if(!rut) return;
    var nom = obj["Nombre"] || obj["NOMBRE"] || obj["nombre"] || "";
    var curso = obj["Curso"] || obj["CURSO"] || obj["curso"] || "";
    var dom = obj["Domicilio"] || obj["DOMICILIO"] || obj["domicilio"] || obj["Dirección"] || obj["Direccion"] || obj["direccion"] || "";
    var comuna = obj["Comuna"] || obj["COMUNA"] || obj["comuna"] || obj["Localidad"] || obj["localidad"] || "";
    var email = obj["Email"] || obj["EMAIL"] || obj["email"] || obj["Correo"] || obj["correo"] || "";
    var zona = obj["Zona"] || obj["ZONA"] || obj["zona"] || "";

    var out = [rut, nom, curso, dom, comuna, email, zona];
    if(existing[rut]){
      sh.getRange(existing[rut], 1, 1, out.length).setValues([out]);
      updated++;
    }else{
      sh.appendRow(out);
      inserted++;
    }
  });

  return json_(true, {inserted: inserted, updated: updated});
}

function listBuses_(){
  const sh = ss_().getSheetByName("Buses");
  const values = sh.getDataRange().getValues();
  const header = values[0];
  const hm = headerMap_(header);
  const idxId = findHeaderIndex_(hm, ["busid","id","bus"]);
  const idxNom = findHeaderIndex_(hm, ["nombre","name"]);
  const idxRec = findHeaderIndex_(hm, ["recorrido","ruta","route"]);
  const idxCap = findHeaderIndex_(hm, ["capacidad","cupos","asientos"]);
  const buses = [];
  for(var i=1;i<values.length;i++){
    var row = values[i];
    var id = String(row[idxId>=0?idxId:0] || "").trim();
    if(!id) continue;
    buses.push({
      id: id,
      nombre: String(row[idxNom>=0?idxNom:1]||"").trim() || ("Bus " + id),
      recorrido: String(row[idxRec>=0?idxRec:2]||"").trim(),
      capacidad: Number(row[idxCap>=0?idxCap:3]||"") || ""
    });
  }
  return json_(true, {buses: buses});
}

function getStudent_(rut){
  rut = normRut_(rut);
  if(!rut) return json_(false, null, "RUT requerido.");
  const st = getStudentObj_(rut);
  if(!st) return json_(false, null, "No se encontró el RUT en Estudiantes.");
  return json_(true, {student: st, status: "ENCONTRADO"});
}

function getStudentObj_(rut){
  rut = normRut_(rut);
  const sh = ss_().getSheetByName("Estudiantes");
  const values = sh.getDataRange().getValues();
  for(var i=1;i<values.length;i++){
    if(normRut_(values[i][0]) === rut){
      return {
        rut: rut,
        nombre: values[i][1] || "",
        curso: values[i][2] || "",
        domicilio: values[i][3] || "",
        comuna: values[i][4] || "",
        email: values[i][5] || "",
        zona: values[i][6] || ""
      };
    }
  }
  return null;
}

function getBusById_(busId){
  busId = String(busId||"").trim();
  const sh = ss_().getSheetByName("Buses");
  const v = sh.getDataRange().getValues();
  for(var i=1;i<v.length;i++){
    var id = String(v[i][0]||"").trim();
    if(id === busId){
      return {
        id: id,
        nombre: String(v[i][1]||"").trim() || ("Bus " + id),
        recorrido: String(v[i][2]||"").trim(),
        capacidad: Number(v[i][3]||"") || ""
      };
    }
  }
  return null;
}

function ensureBusSheet_(busId){
  const ss = ss_();
  const name = "BUS_" + String(busId).trim();
  var sh = ss.getSheetByName(name);
  if(!sh){
    sh = ss.insertSheet(name);
    sh.appendRow(["Timestamp","RUT","Nombre","Curso","Email","Comuna","Domicilio","BusID","Recorrido","Estado","Digitador"]);
  }
  return sh;
}

function seatCount_(busId){
  const sh = ss_().getSheetByName("Asignaciones");
  const v = sh.getDataRange().getValues();
  var cnt = 0;
  for(var i=1;i<v.length;i++){
    var rowBus = String(v[i][7]||"").trim();
    var estado = String(v[i][9]||"").trim();
    if(rowBus === String(busId).trim() && estado === "ASIGNADO") cnt++;
  }
  return cnt;
}

function upsertByRut_(sh, rut, row, rutColIndex){
  const v = sh.getDataRange().getValues();
  for(var i=1;i<v.length;i++){
    if(normRut_(v[i][rutColIndex]) === normRut_(rut)){
      sh.getRange(i+1, 1, 1, row.length).setValues([row]);
      return {updated:true};
    }
  }
  sh.appendRow(row);
  return {updated:false};
}

function removeFromBusSheets_(rut){
  const ss = ss_();
  const target = normRut_(rut);
  ss.getSheets().forEach(sh=>{
    const name = sh.getName();
    if(name.indexOf("BUS_") !== 0) return;
    const v = sh.getDataRange().getValues();
    for(var i=v.length-1;i>=1;i--){
      if(normRut_(v[i][1]) === target){
        sh.deleteRow(i+1);
      }
    }
  });
}

function removeFromWaiting_(rut){
  const sh = ss_().getSheetByName("En_espera");
  const v = sh.getDataRange().getValues();
  const target = normRut_(rut);
  for(var i=v.length-1;i>=1;i--){
    if(normRut_(v[i][1]) === target){
      sh.deleteRow(i+1);
    }
  }
}


function updateStudent_(body){
  const rut = normRut_(body.rut);
  if(!rut) return json_(false, null, "RUT requerido.");
  const sh = ss_().getSheetByName("Estudiantes");
  if(!sh) return json_(false, null, "No existe la hoja Estudiantes.");

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try{
    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();
    if(lastRow < 2) return json_(false, null, "La hoja Estudiantes no tiene datos.");

    const values = sh.getRange(2,1,lastRow-1,lastCol).getValues();
    let rowIndex = -1;
    for(let i=0;i<values.length;i++){
      if(normRut_(values[i][0]) === rut){ rowIndex = i + 2; break; } // sheet row
    }
    if(rowIndex === -1) return json_(false, null, "No se encontró el RUT en Estudiantes.");

    const updates = body.updates || {};
    // Columnas esperadas (A..G): RUT, NOMBRE, CURSO, DOMICILIO, COMUNA, CORREO, ZONA
    const map = { nombre:2, curso:3, domicilio:4, comuna:5, email:6, zona:7 };
    const toSet = [];
    Object.keys(map).forEach(k=>{
      if(updates.hasOwnProperty(k)){
        toSet.push([rowIndex, map[k], String(updates[k] || "")]);
      }
    });

    // Si el sheet tiene menos columnas que 7, ampliar y escribir encabezados mínimos
    if(sh.getLastColumn() < 7){
      const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
      const needed = ["RUT","NOMBRE","CURSO","DOMICILIO","COMUNA","CORREO","ZONA"];
      for(let c=headers.length; c<needed.length; c++){
        sh.getRange(1,c+1).setValue(needed[c]);
      }
    }

    toSet.forEach(t=>{
      sh.getRange(t[0], t[1]).setValue(t[2]);
    });

    return json_(true, {rut: rut, updated: Object.keys(updates)});
  }finally{
    lock.releaseLock();
  }
}


function assignBus_(body){
  const rut = normRut_(body.rut);
  const busId = String(body.busId||"").trim();
  const recorrido = String(body.recorrido||"").trim();
  const digitador = String(body.digitador||"").trim();

  if(!rut) return json_(false, null, "RUT requerido.");
  if(!busId) return json_(false, null, "BusID requerido.");

  const bus = getBusById_(busId);
  if(!bus) return json_(false, null, "Bus no encontrado en hoja Buses.");

  const student = getStudentObj_(rut);
  if(!student) return json_(false, null, "Estudiante no encontrado.");

  // Avoid duplicates if reassigning
  removeFromBusSheets_(rut);
  removeFromWaiting_(rut);

  const now = new Date();
  const ts = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  const cap = bus.capacidad ? Number(bus.capacidad) : null;
  const current = seatCount_(busId);
  const hasSeat = (cap === null || cap === 0) ? true : (current < cap);
  const rec = recorrido || bus.recorrido || "";

  const asigSh = ss_().getSheetByName("Asignaciones");
  const waitSh = ss_().getSheetByName("En_espera");

  if(!hasSeat){
    const rowWait = [ts, rut, student.nombre, student.curso, student.email, student.comuna, student.domicilio, busId, rec, "EN_ESPERA", digitador, "Sin cupo"];
    upsertByRut_(waitSh, rut, rowWait, 1);
    const rowAsig = [ts, rut, student.nombre, student.curso, student.email, student.comuna, student.domicilio, busId, rec, "EN_ESPERA", digitador];
    upsertByRut_(asigSh, rut, rowAsig, 1);
    return json_(true, {state:"EN_ESPERA", message:"Bus sin cupo. Enviado a En_espera."});
  }

  const row = [ts, rut, student.nombre, student.curso, student.email, student.comuna, student.domicilio, busId, rec, "ASIGNADO", digitador];
  upsertByRut_(asigSh, rut, row, 1);
  const busSheet = ensureBusSheet_(busId);
  upsertByRut_(busSheet, rut, row, 1);

  return json_(true, {state:"ASIGNADO", message:"Asignado y registrado en hoja BUS_" + busId + "."});
}

function getBusDashboard_(busId){
  busId = String(busId||"").trim();
  if(!busId) return json_(false, null, "BusID requerido.");
  const bus = getBusById_(busId);
  if(!bus) return json_(false, null, "Bus no encontrado.");

  const asigSheet = ensureBusSheet_(busId);
  const asigVals = asigSheet.getDataRange().getValues();
  const headers = asigVals[0];
  const asignados = [];
  for(var i=1;i<asigVals.length;i++){
    var obj = {};
    for(var c=0;c<headers.length;c++) obj[headers[c]] = asigVals[i][c];
    asignados.push(obj);
  }

  const waitSh = ss_().getSheetByName("En_espera");
  const waitVals = waitSh.getDataRange().getValues();
  const wHeaders = waitVals[0];
  const enEspera = [];
  for(var r=1;r<waitVals.length;r++){
    if(String(waitVals[r][7]||"").trim() === busId){
      var o = {};
      for(var c2=0;c2<wHeaders.length;c2++) o[wHeaders[c2]] = waitVals[r][c2];
      enEspera.push(o);
    }
  }

  return json_(true, {bus: bus, asignados: asignados, enEspera: enEspera});
}

function getCursoDashboard_(curso){
  curso = String(curso||"").trim().toLowerCase();
  const sh = ss_().getSheetByName("Asignaciones");
  const v = sh.getDataRange().getValues();
  const header = v[0];
  const rows = [];
  for(var i=1;i<v.length;i++){
    var c = String(v[i][3]||"").trim().toLowerCase();
    if(!curso || c === curso){
      var obj = {};
      for(var j=0;j<header.length;j++) obj[header[j]] = v[i][j];
      rows.push(obj);
    }
  }
  return json_(true, {rows: rows});
}

function json_(ok, data, error){
  var payload = {ok: !!ok};
  if(data){
    Object.keys(data).forEach(k=> payload[k] = data[k]);
  }
  if(error) payload.error = error;
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
