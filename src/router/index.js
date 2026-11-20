import { createRouter, createWebHashHistory } from "vue-router";
import Dashboard from "../views/Dashboard.vue";
import ServerDetail from "../views/ServerDetail.vue";

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "dashboard", component: Dashboard },
    { path: "/server/:id", name: "server-detail", component: ServerDetail, props: true },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
  scrollBehavior() { return { top: 0, behavior: "smooth" }; },
});