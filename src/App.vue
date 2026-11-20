<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import { closeSockets, connectDashboardSockets, connectDetailSocket, monitor, refreshActiveDetail, saveThemeOptions } from "./lib/api.js";
import { setLocale, t } from "./lib/i18n.js";
import { applySiteTheme } from "./lib/theme.js";

const route=useRoute();
const settingsOpen=ref(false),settingsError=ref(""),settingsSaving=ref(false);
const localOptions=ref({cardStyle:"detailed",accent:"blue",showSmallCharts:true});
const statusLabel=computed(()=>t(({idle:"waiting",connecting:"connecting",connected:"live",reconnecting:"reconnecting",paused:"paused",failed:"stopped",error:"connectionError"})[monitor.wsStatus]||"waiting"));
const appTitle=computed(()=>monitor.config?.site_title||"Cloudflare Server Monitor");
const siteVersion=computed(()=>monitor.config?.version||"");
watch(()=>monitor.config?.theme_options,(value)=>{
 localOptions.value={cardStyle:value?.cardStyle||"detailed",accent:value?.accent||"blue",showSmallCharts:value?.showSmallCharts!==false};
},{immediate:true,deep:true});
watch(()=>localOptions.value.accent,(accent)=>{document.documentElement.dataset.accent=accent||"blue";},{immediate:true});
watch(()=>monitor.config?.default_language,(value)=>setLocale(value),{immediate:true});
watch(()=>monitor.config?.preferred_theme,(value)=>applySiteTheme(value),{immediate:true});

async function saveOptions(){
 settingsSaving.value=true;settingsError.value="";
 try{await saveThemeOptions({...localOptions.value});settingsOpen.value=false;}
 catch(error){settingsError.value=error.message||"Save failed";}
 finally{settingsSaving.value=false;}
}
async function onVisibilityChange(){
 if(document.visibilityState==="hidden"){closeSockets();return;}
 if(route.name==="server-detail"){
  try{await refreshActiveDetail();}catch(error){monitor.error=error.message||"Detail refresh failed";}
  connectDetailSocket();
 }else{
  // Keep /api/servers one-shot; reconnect with the cached server ID list.
  connectDashboardSockets();
 }
}
onMounted(()=>document.addEventListener("visibilitychange",onVisibilityChange));
onUnmounted(()=>{document.removeEventListener("visibilitychange",onVisibilityChange);closeSockets();});
</script>
<template>
 <div class="app-shell">
  <header class="topbar"><div class="topbar-inner">
   <RouterLink class="brand" to="/" aria-label="Back to overview"><span class="brand-mark"><i></i><i></i><i></i></span><span class="brand-copy"><strong>{{ appTitle }}</strong><small>SERVER MONITOR</small></span></RouterLink>
   <div class="top-actions">
    <span class="connection-indicator" :class="'is-'+monitor.wsStatus"><i></i>{{ statusLabel }}</span>
    <button class="icon-button" type="button" :title="t('settings')" :aria-label="t('settings')" @click="settingsOpen=true">
     <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"/><path d="m19.4 13.5 1.1.9-1.3 2.3-1.4-.4a8 8 0 0 1-1.4.8l-.3 1.5h-2.7l-.3-1.5a8 8 0 0 1-1.5-.8l-1.4.4-1.3-2.3 1.1-.9a7 7 0 0 1 0-1.6l-1.1-.9 1.3-2.3 1.4.4a8 8 0 0 1 1.5-.8l.3-1.5h2.7l.3 1.5a8 8 0 0 1 1.4.8l1.4-.4 1.3 2.3-1.1.9a7 7 0 0 1 0 1.6Z"/></svg>
    </button>
    <a class="icon-button" href="/admin#/admin" :title="t('admin')" :aria-label="t('admin')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.5 6v5.3c0 4.4 3.2 8.4 7.5 9.7 4.3-1.3 7.5-5.3 7.5-9.7V6L12 3Z"/><path d="m9 12 2 2 4-4"/></svg></a>
   </div>
  </div></header>
  <main class="main-content">
   <div v-if="monitor.error" class="global-error" role="alert"><span>{{ monitor.error }}</span><button type="button" @click="monitor.error=''">{{ t('close') }}</button></div>
   <RouterView/>
  </main>
  <footer class="site-footer"><span>Live infrastructure overview</span><a :title="siteVersion?'CF Server Monitor '+siteVersion:'CF Server Monitor'" href="https://github.com/MoeNekoNya/CF-Server-Monitor" target="_blank" rel="noreferrer">Powered by CF-Server-Monitor ↗</a></footer>
  <div v-if="settingsOpen" class="modal-backdrop" @click.self="settingsOpen=false">
   <section class="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <div class="modal-heading"><div><span class="eyebrow">PREFERENCES</span><h2 id="settings-title">{{ t('settings') }}</h2></div><button class="icon-button close-button" type="button" :aria-label="t('close')" @click="settingsOpen=false">×</button></div>
    <label class="field-label">{{ t('layout') }}<select v-model="localOptions.cardStyle"><option value="classic">经典 / Classic</option><option value="plain">简约 / Plain</option><option value="latency">延迟 / Latency</option><option value="detailed">详细 / Detailed</option><option value="wide">宽卡 / Wide</option><option value="compact">紧凑 / Compact</option></select></label>
    <label class="field-label">{{ t('accent') }}<select v-model="localOptions.accent"><option value="blue">蓝色 / Blue</option><option value="violet">紫色 / Violet</option><option value="green">绿色 / Green</option><option value="orange">橙色 / Orange</option></select></label>
    <label class="switch-row"><span><strong>{{ t('miniCharts') }}</strong><small>仅使用服务器列表接口已返回的 ping / loss 数据</small></span><input v-model="localOptions.showSmallCharts" type="checkbox"></label>
    <p v-if="settingsError" class="form-error" role="alert">{{ settingsError }}</p>
    <p class="settings-note">{{ t('saveNeedsJwt') }}</p>
    <div class="modal-actions"><button class="button button-quiet" type="button" @click="settingsOpen=false">{{ t('cancel') }}</button><button class="button button-primary" type="button" :disabled="settingsSaving" @click="saveOptions">{{ settingsSaving?t('saving'):t('save') }}</button></div>
   </section>
  </div>
 </div>
</template>