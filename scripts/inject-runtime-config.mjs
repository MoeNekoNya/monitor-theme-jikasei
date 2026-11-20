import fs from "node:fs";
const filename="dist/index.html";
if(!fs.existsSync(filename))throw new Error("dist/index.html 不存在");
let html=fs.readFileSync(filename,"utf8");
const attr=(value)=>String(value||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
for(const [key,value] of Object.entries({
 "__API_BASE__":process.env.API_BASE||"",
 "__CSP_API__":process.env.CSP_API||"",
 "__CSP_STATIC__":process.env.CSP_STATIC||""
}))html=html.replaceAll(key,attr(value));
if(process.env.TITLE)html=html.replace("<title>Monitor</title>","<title>"+attr(process.env.TITLE)+"</title>");
if(process.env.BACKGROUND_IMAGE){
 const cssValue=JSON.stringify(String(process.env.BACKGROUND_IMAGE)).replace(/</g,"\\3c ");
 html=html.replace('<style id="runtime-background">:root{--runtime-background-image:none}</style>',
  '<style id="runtime-background">:root{--runtime-background-image:url('+cssValue+')}</style>');
}
fs.writeFileSync(filename,html);
const allowed=new Set(["index.html","assets"]);
for(const entry of fs.readdirSync("dist"))if(!allowed.has(entry))throw new Error("dist 顶层出现未允许文件："+entry);
if(!fs.statSync("dist/assets").isDirectory())throw new Error("dist/assets 缺失");
console.log("✓ 运行时配置已注入；dist 仅包含 index.html 与 assets/");