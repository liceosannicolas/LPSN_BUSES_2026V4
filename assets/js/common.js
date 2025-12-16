
(function(){
  const root = document.documentElement;
  const theme = localStorage.getItem("te-theme") || "dark";
  root.setAttribute("data-theme", theme);

  const font = parseInt(localStorage.getItem("te-font") || "0", 10);
  if(font) root.style.fontSize = (16 + font) + "px";

  const contrast = localStorage.getItem("te-contrast") || "0";
  if(contrast === "1") root.style.filter = "contrast(1.15) saturate(1.05)";

  window.TE = window.TE || {};
  TE.toast = (msg, kind="info") => {
    const el = document.getElementById("toast");
    if(!el) return alert(msg);
    el.querySelector("strong").textContent = kind === "ok" ? "Listo" : kind === "warn" ? "Atención" : kind==="err" ? "Error" : "Info";
    el.querySelector("span").textContent = msg;
    el.classList.add("show");
    clearTimeout(TE._t);
    TE._t = setTimeout(()=>el.classList.remove("show"), 3200);
  };

  TE.toggleTheme = () => {
    const cur = root.getAttribute("data-theme") || "dark";
    const next = cur === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("te-theme", next);
  };

  TE.toggleContrast = () => {
    const cur = localStorage.getItem("te-contrast") || "0";
    const next = cur === "1" ? "0" : "1";
    localStorage.setItem("te-contrast", next);
    location.reload();
  };

  TE.fontUp = () => {
    const cur = parseInt(localStorage.getItem("te-font") || "0",10);
    const next = Math.min(cur+1, 6);
    localStorage.setItem("te-font", String(next));
    location.reload();
  };
  TE.fontDown = () => {
    const cur = parseInt(localStorage.getItem("te-font") || "0",10);
    const next = Math.max(cur-1, -2);
    localStorage.setItem("te-font", String(next));
    location.reload();
  };

  TE.speakAll = () => {
    try{
      if(!("speechSynthesis" in window)) return TE.toast("Tu navegador no soporta lector de voz.", "warn");
      const text = document.body.innerText.replace(/\s+/g," ").trim().slice(0, 12000);
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "es-CL";
      speechSynthesis.speak(u);
      TE.toast("Leyendo contenido…", "ok");
    }catch(e){
      TE.toast("No se pudo iniciar el lector.", "err");
    }
  };
})();
