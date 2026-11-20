<script setup>
import { computed } from "vue";
import { chartPoints } from "../lib/metrics.js";
import { t } from "../lib/i18n.js";
const props=defineProps({title:{type:String,required:true},rows:{type:Array,default:()=>[]},metric:{type:String,required:true},suffix:{type:String,default:""}});
const points=computed(()=>chartPoints(props.rows,props.metric));
const lastValue=computed(()=>{
 for(let i=props.rows.length-1;i>=0;i--){
  const raw=props.rows[i]?.[props.metric];
  if(raw===null)return t("timeout");
  if(raw===false||raw===undefined)continue;
  const value=Number(raw);if(Number.isFinite(value))return value.toFixed(1)+props.suffix;
 }
 return "—";
});
</script>
<template><section class="chart-card"><div class="chart-heading"><span>{{ title }}</span><strong>{{ lastValue }}</strong></div><div v-if="points" class="chart-plot"><svg viewBox="0 0 600 150" preserveAspectRatio="none" role="img" :aria-label="title+' history'"><line v-for="y in [25,62,99,136]" :key="y" x1="0" :y1="y" x2="600" :y2="y" class="chart-gridline"/><polyline :points="points" class="chart-line"/></svg></div><div v-else class="chart-empty">{{ t('noHistory') }}</div></section></template>