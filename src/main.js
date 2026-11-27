import { unzlibSync, zlibSync } from "fflate";
import { configureZlib } from "../shared/squadCodec.js";
import { getRoster, setToken } from "./api.js";
import { login } from "./discord.js";
import { h, mount } from "./dom.js";
import { homeScreen } from "./screens/home.js";
import { profileEditScreen, profileScreen } from "./screens/profile.js";
import { squadScreen } from "./screens/squad.js";
import { routes, state } from "./state.js";
import "./styles.css";

configureZlib({ deflate: (b) => zlibSync(b, { level: 9 }), inflate: (b) => unzlibSync(b) });

// Discord (movil) dibuja su propia barra (canal + Leave) encima de la Activity: hay que dejar margen arriba.
const platform = new URLSearchParams(location.search).get("platform") || "desktop";
document.documentElement.dataset.platform = platform;

const app = document.getElementById("app");
routes.home = () => homeScreen(app);
routes.profile = () => profileScreen(app);
routes.profileEdit = () => profileEditScreen(app);
routes.squad = (opts) => squadScreen(app, opts);

(async () => {
  mount(app, h("p", { class: "loading" }, "Conectando con Discord…"));
  try {
    const session = await login();
    setToken(session.token);
    state.user = session.user;
    state.roster = await getRoster();
    state.byUuid = new Map(state.roster.map((c) => [c.uuid, c]));
    routes.home();
  } catch (err) {
    console.error(err);
    mount(app, h("p", { class: "error" }, `No se pudo iniciar: ${err.message}`),
      h("p", { class: "hint" }, "Esta pagina solo funciona dentro de Discord (Activity)."));
  }
})();
