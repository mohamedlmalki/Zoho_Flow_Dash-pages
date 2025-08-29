// functions/api/hello.js
export function onRequest(context) {
  return new Response("Hello from Cloudflare!");
}