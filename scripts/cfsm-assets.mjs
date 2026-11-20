import fs from "node:fs";
import path from "node:path";

const publicDir="public";
const assetDir=path.join("dist","assets");
fs.mkdirSync(assetDir,{recursive:true});
const flags=path.join(publicDir,"flags");
if(!fs.existsSync(flags))throw new Error("public/flags missing");
fs.cpSync(flags,path.join(assetDir,"flags"),{recursive:true});
for(const name of ["favicon.svg","apple-touch-icon.png","favicon.ico"]){
 const src=path.join(publicDir,name);
 if(fs.existsSync(src))fs.copyFileSync(src,path.join(assetDir,name));
}
const top=fs.readdirSync("dist").sort();
if(JSON.stringify(top)!==JSON.stringify(["assets","index.html"])) {
 throw new Error("CFSM dist must contain only assets/ and index.html: "+top.join(", "));
}
console.log("✓ CFSM static assets packaged under dist/assets");
