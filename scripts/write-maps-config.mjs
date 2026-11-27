/*
  Netlify build step. Reads GOOGLE_MAPS_API_KEY and writes config.js.
  An empty or missing key is valid: the site then shows no Google rating.
  The key is a browser key. Do not print it. Do not commit a filled config.js.
*/
import fs from "fs";

const raw = String(process.env.GOOGLE_MAPS_API_KEY || "").trim();
const key = /^[A-Za-z0-9_-]{20,}$/.test(raw) ? raw : "";
if (raw && !key) {
  console.error("GOOGLE_MAPS_API_KEY is set but does not look like a browser key. Writing an empty config.");
}
const callToBook = String(process.env.CALL_TO_BOOK_ENABLED || "").trim() === "true";
const file = new URL("../config.js", import.meta.url);
fs.writeFileSync(file, "window.BYO_CONFIG = " + JSON.stringify({ googleMapsApiKey: key, callToBook: callToBook }) + ";\n");
if (key) console.log("Wrote config.js from GOOGLE_MAPS_API_KEY.");
else console.log("No GOOGLE_MAPS_API_KEY. Live Google ratings stay hidden.");
console.log(callToBook ? "Call to book is enabled for this build." : "Call to book stays off.");
