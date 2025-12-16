
const TE_API = {
  get baseUrl(){ return localStorage.getItem("te-sync-url") || ""; },
  get apiKey(){ return localStorage.getItem("te-sync-key") || ""; },

  async call(action, payload={}){
    if(!TE_API.baseUrl) throw new Error("Falta URL del Sync (Apps Script).");
    const body = { action, apiKey: TE_API.apiKey || "", ...payload };
    const res = await fetch(TE_API.baseUrl, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(body),
      mode: "cors"
    });
    const data = await res.json().catch(()=>({ok:false, error:"Respuesta inválida."}));
    if(!data.ok) throw new Error(data.error || "Error API.");
    return data;
  }
};
