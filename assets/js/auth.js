
const TE_AUTH = {
  allowed: [
    "belenacuna@liceosannicolas.cl",
    "franciscopinto@liceosannicolas.cl",
    "echeverri@liceosannicolas.cl"
  ],
  pass: "Buses2026",
  login(email, pass){
    email = (email||"").trim().toLowerCase();
    if(!TE_AUTH.allowed.includes(email)) return {ok:false, msg:"Correo no autorizado."};
    if((pass||"") !== TE_AUTH.pass) return {ok:false, msg:"Clave incorrecta."};
    localStorage.setItem("te-user", JSON.stringify({email, ts: Date.now()}));
    return {ok:true};
  },
  logout(){
    localStorage.removeItem("te-user");
    location.href = "../app/login.html";
  },
  getUser(){
    try{ return JSON.parse(localStorage.getItem("te-user")||"null"); }catch(e){ return null; }
  },
  require(){
    const u = TE_AUTH.getUser();
    if(!u || !u.email) location.href = "../app/login.html";
    return u;
  }
};
