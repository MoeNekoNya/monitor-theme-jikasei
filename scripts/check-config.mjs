import fs from "node:fs";
import path from "node:path";

const required=[
 "index.html","package.json","vite.config.js","src/main.js","src/App.vue","src/router/index.js",
 "src/lib/api.js","src/lib/metrics.js","src/lib/i18n.js","src/lib/theme.js",
 "src/views/Dashboard.vue","src/views/ServerDetail.vue","src/components/ServerCard.vue",
 "src/components/MetricChart.vue",".github/workflows/ci.yml",".github/workflows/deploy.yml",
 "scripts/inject-runtime-config.mjs","test/metrics.test.js"
];
const failures=[];
for(const file of required)if(!fs.existsSync(file))failures.push("缺少文件："+file);
const pkg=JSON.parse(fs.readFileSync("package.json","utf8"));
if(!pkg.dependencies?.vue||!pkg.dependencies?.["vue-router"])failures.push("必须使用 Vue 3 和 Vue Router");
if(pkg.dependencies?.react||pkg.dependencies?.["react-dom"])failures.push("不能保留 React 运行时依赖");
const api=fs.readFileSync("src/lib/api.js","utf8");
const getMatch=api.match(/ALLOWED_GET=\[([^\]]+)\]/);
const postMatch=api.match(/ALLOWED_POST=\[([^\]]+)\]/);
const values=(match)=>match?[...match[1].matchAll(/["']([^"']+)["']/g)].map((m)=>m[1]):[];
const expectedGet=["/api/config","/api/servers","/api/server","/api/history/all"];
const expectedPost=["/api/theme_options"];
if(JSON.stringify(values(getMatch))!==JSON.stringify(expectedGet))failures.push("GET API 白名单不正确");
if(JSON.stringify(values(postMatch))!==JSON.stringify(expectedPost))failures.push("POST API 白名单不正确");
if(!api.includes('new URL("/api/ws"'))failures.push("缺少 WebSocket /api/ws");
if(/setInterval\s*\(/.test(api))failures.push("禁止使用 setInterval 轮询");
if(!/sample\.data\s*\|\|\s*sample\.payload\s*\|\|\s*sample\.metrics/.test(api))failures.push("缺少 batchUpdate 样本兼容");
if(!/scope:"all",\s*ids:/.test(api))failures.push("首页必须通过 IDs 过滤 subscribe=all");
if(!api.includes("frontend_ws_timeout_minutes"))failures.push("缺少 WebSocket 时限控制");
if(!api.includes("X-Turnstile-Verified")||!api.includes("jwt_token"))failures.push("缺少 JWT / Turnstile 支持");
const banned=["/admin/api","/updateDatabase","/clearHistory","/api/me","/themes/"];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(/\.(js|vue|html)$/.test(entry.name)){const text=fs.readFileSync(file,"utf8");for(const item of banned)if(text.includes(item))failures.push("发现旧接口 "+item+"："+file);}}}
walk("src");
const html=fs.readFileSync("index.html","utf8");
if(!html.includes('src="./src/main.js"'))failures.push("入口应为 Vue main.js");
if(html.includes("title-probe.js"))failures.push("不得加载旧 title-probe 脚本");
const deploy=fs.readFileSync(".github/workflows/deploy.yml","utf8");
if(!deploy.includes("contents: write")||!deploy.includes("HEAD:dist"))failures.push("发布工作流缺少写权限或 dist 推送");
if(deploy.includes("--force"))failures.push("dist 发布不能 force push");
if(failures.length){console.error(failures.map((x)=>"✗ "+x).join("\n"));process.exit(1);}
console.log("✓ Vue SPA、API 白名单、实时通道与部署检查通过");