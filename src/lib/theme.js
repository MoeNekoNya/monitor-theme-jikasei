export function applySiteTheme(preferredTheme) {
 const mode=String(preferredTheme||"auto").toLowerCase();
 const dark=mode==="dark" ? true : mode==="light" ? false :
  (typeof matchMedia==="function" && matchMedia("(prefers-color-scheme: dark)").matches);
 document.documentElement.classList.toggle("dark",dark);
 document.documentElement.style.colorScheme=dark?"dark":"light";
}