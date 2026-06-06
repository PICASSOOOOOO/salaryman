---
name: Blueprint / CAD schematic decoder
description: How the Creative-suite "Blueprint Decoder" deciphers CAD files & engineering schematics
---

# Blueprint Decoder (/creative/schematic)

AI tool that deciphers an uploaded CAD file or engineering schematic and streams
back ONE combined Markdown report (overview, type, dimensions, materials/tolerances,
bill-of-materials). Lives in the Creative suite.

## File handling (the durable decisions)
- Client always sends a base64 **data URL**; the SERVER classifies, so there is one
  upload path on the client (no per-format read logic):
  - image/* → vision (`input_image`)
  - application/pdf → document input (`input_file`) — gpt-4o reads PDFs natively via
    the **Responses API**, so NO pdf→image rasterization / native deps needed.
  - everything else → treated as CAD source: utf-8 decode, and if the decode is
    mostly control/replacement bytes (binary like DWG / binary STL) fall back to
    printable-string extraction (geometry coords are lost, so the prompt steers the
    model to headers/layers/entity names/counts). Truncated to a char cap.
- Uses `openai.responses.create({ model:"gpt-4o", stream:true, input:[...] })` and
  reads `response.output_text.delta` events, re-emitted as the same
  `text/event-stream` `data: {content|status|error|done}` convention as analyze-*.

## Security invariant
**Any AI route that burns OpenAI credits MUST gate on `req.isAuthenticated()`
server-side** (401 "Login required") — frontend auth gating is bypassable and
leaves an unauthenticated cost-abuse hole. Also validate the data URL shape
(`data:<mime>;base64,`) AND base64 charset before decoding; `Buffer.from(...,"base64")`
is permissive and will silently accept garbage otherwise.
**Why:** a review caught the route initially open (copied analyze-vision, which is
unauthenticated); direct API calls could run gpt-4o at our expense.
**How to apply:** when adding any `/tools/*` or `/studio/*` AI endpoint, copy the
`if (!req.isAuthenticated())` guard the CRM routes in tools.ts use; don't assume the
router is auth-protected globally (it isn't).
