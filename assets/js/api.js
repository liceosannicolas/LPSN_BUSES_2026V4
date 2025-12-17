const TE_API = {
  get baseUrl(){ return localStorage.getItem("te-sync-url") || ""; },
  get apiKey(){ return localStorage.getItem("te-sync-key") || ""; },

  _getStoredEmail(){
    // Intenta tomar email desde sesión local (login digitadores)
    try{
      const u = JSON.parse(localStorage.getItem("te-user")||"null");
      if(u && u.email) return String(u.email).toLowerCase().trim();
    }catch(e){}
    // Email opcional para pruebas (settings)
    const e = (localStorage.getItem("te-test-email")||"").trim().toLowerCase();
    return e || "";
  },

  async call(action, payload={}){
    if(!TE_API.baseUrl) throw new Error("Falta URL del Sync (Apps Script).");

    const email = payload.email || payload.digitador || payload.user || TE_API._getStoredEmail();
    const body = { action, apiKey: TE_API.apiKey || "", ...payload };

    // Seguridad: si no viene email en payload, lo añadimos desde sesión/local storage
    if(!body.email && email) body.email = email;

    const res = await fetch(TE_API.baseUrl, {
      method: "POST",
      headers: {"Content-Type":"text/plain;charset=utf-8"},
      body: JSON.stringify(body),
      mode: "cors"
    });
    const txt = await res.text();
    let data;
    try{ data = JSON.parse(txt); }catch(e){ data = {ok:false, error:"Respuesta inválida."}; }

    if(!data.ok) throw new Error(data.error || "Error API.");
    return data;
  }
};
