import fs from "node:fs";

if (!fs.existsSync("dist/index.html")) throw new Error("dist/index.html missing");
if (!fs.existsSync("dist/assets")) throw new Error("dist/assets missing");
const top=fs.readdirSync("dist").sort();
if (JSON.stringify(top)!==JSON.stringify(["assets","index.html"])) {
  throw new Error("CFSM dist must contain only assets/ and index.html: "+top.join(", "));
}
console.log("✓ CFSM theme output contains only index.html and assets/");
