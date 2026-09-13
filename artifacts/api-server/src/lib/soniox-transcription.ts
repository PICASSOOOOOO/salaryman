import { Buffer } from "node:buffer";

const SONIOX_API_BASE_URL = process.env.SONIOX_API_BASE_URL || "https://api.soniox.com/v1";
const SONIOX_MODEL = "stt-async-v5";
const REQUEST_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 250;
const MAX_POLL_MS = 12_000;

export type SonioxTranscriptionOptions = {
  audioBuffer: Buffer;
  filename: string;
  mimeType?: string;
  translationTo?: string;
};

export type SonioxTranscriptionResult = {
  text: string;
  sourceText: string;
  translation?: string;
};

export class SonioxNotConfiguredError extends Error {
  constructor() {
    super("SONIOX_API_KEY is not configured");
    this.name = "SonioxNotConfiguredError";
  }
}

export class SonioxRequestError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "SonioxRequestError";
    this.status = status;
  }
}

export function isSonioxConfigured(): boolean {
  return Boolean(process.env.SONIOX_API_KEY?.trim());
}

function requireApiKey(): string {
  const apiKey = process.env.SONIOX_API_KEY?.trim();
  if (!apiKey) throw new SonioxNotConfiguredError();
  return apiKey;
}

function sonioxHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };
}

async function requestSoniox(
  path: string,
  init: RequestInit,
  apiKey: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${SONIOX_API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...sonioxHeaders(apiKey),
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300).replace(/\s+/g, " ");
      throw new SonioxRequestError(
        `Soniox ${init.method ?? "GET"} ${path} failed (${response.status})${detail ? `: ${detail}` : ""}`,
        response.status,
      );
    }

    return response;
  } catch (error) {
    if (error instanceof SonioxRequestError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new SonioxRequestError(`Soniox ${init.method ?? "GET"} ${path} timed out`);
    }
    throw new SonioxRequestError(
      `Soniox ${init.method ?? "GET"} ${path} failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function extractTranslatedText(payload: Record<string, unknown>): string {
  const tokens = Array.isArray(payload.tokens) ? payload.tokens : [];
  return tokens
    .filter((token): token is Record<string, unknown> => (
      typeof token === "object" &&
      token !== null &&
      token.translation_status === "translation"
    ))
    .map((token) => typeof token.text === "string" ? token.text : "")
    .join("")
    .trim();
}

function extractTranscriptText(payload: Record<string, unknown>): string {
  return readString(payload.text) ||
    (Array.isArray(payload.tokens)
      ? payload.tokens
        .filter((token): token is Record<string, unknown> => typeof token === "object" && token !== null)
        .map((token) => typeof token.text === "string" ? token.text : "")
        .join("")
        .trim()
      : "");
}

function validateTranslationTarget(translationTo?: string): string | undefined {
  if (translationTo === undefined) return undefined;
  const target = translationTo.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(target)) {
    throw new SonioxRequestError("translationTo must be a two-letter ISO language code");
  }
  return target;
}

async function uploadAudio(
  options: SonioxTranscriptionOptions,
  apiKey: string,
): Promise<string> {
  const form = new FormData();
  // Node's Buffer is backed by ArrayBufferLike, while the publish toolchain's
  // DOM typings require an owned ArrayBuffer for BlobPart. Copy the bytes into
  // an ArrayBuffer before handing them to the web-standard FormData API.
  const audioData = new ArrayBuffer(options.audioBuffer.byteLength);
  new Uint8Array(audioData).set(options.audioBuffer);
  form.append(
    "file",
    new Blob([audioData], { type: options.mimeType || "application/octet-stream" }),
    options.filename,
  );

  const response = await requestSoniox("/files", {
    method: "POST",
    body: form,
  }, apiKey);
  const payload = await response.json() as { id?: unknown };
  const fileId = readString(payload.id);
  if (!fileId) throw new SonioxRequestError("Soniox upload response did not include a file id");
  return fileId;
}

async function createTranscription(
  fileId: string,
  translationTo: string | undefined,
  apiKey: string,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: SONIOX_MODEL,
    file_id: fileId,
    ...(translationTo && {
      enable_language_identification: true,
      translation: {
        type: "one_way",
        target_language: translationTo,
      },
    }),
  };

  const response = await requestSoniox("/transcriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, apiKey);
  const payload = await response.json() as { id?: unknown };
  const transcriptionId = readString(payload.id);
  if (!transcriptionId) {
    throw new SonioxRequestError("Soniox transcription response did not include an id");
  }
  return transcriptionId;
}

async function waitForTranscription(
  transcriptionId: string,
  apiKey: string,
): Promise<void> {
  const deadline = Date.now() + MAX_POLL_MS;

  while (Date.now() < deadline) {
    const response = await requestSoniox(`/transcriptions/${encodeURIComponent(transcriptionId)}`, {}, apiKey);
    const payload = await response.json() as { status?: unknown; error_message?: unknown };
    const status = readString(payload.status);

    if (status === "completed") return;
    if (status === "error") {
      throw new SonioxRequestError(`Soniox transcription failed${readString(payload.error_message) ? `: ${readString(payload.error_message)}` : ""}`);
    }
    if (status !== "queued" && status !== "processing") {
      throw new SonioxRequestError(`Soniox returned unknown transcription status: ${status || "missing"}`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new SonioxRequestError("Soniox transcription timed out");
}

async function getTranscript(
  transcriptionId: string,
  apiKey: string,
): Promise<{ sourceText: string; translation?: string }> {
  const response = await requestSoniox(
    `/transcriptions/${encodeURIComponent(transcriptionId)}/transcript`,
    {},
    apiKey,
  );
  const payload = await response.json() as Record<string, unknown>;
  const sourceText = extractTranscriptText(payload);
  const translation = extractTranslatedText(payload);
  if (!sourceText && !translation) {
    throw new SonioxRequestError("Soniox transcript response did not include text");
  }
  return { sourceText, ...(translation ? { translation } : {}) };
}

async function deleteRemoteResource(path: string, apiKey: string): Promise<void> {
  try {
    await requestSoniox(path, { method: "DELETE" }, apiKey);
  } catch (error) {
    console.warn(`[Soniox] Cleanup failed for ${path}: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

export async function transcribeWithSoniox(
  options: SonioxTranscriptionOptions,
): Promise<SonioxTranscriptionResult> {
  const apiKey = requireApiKey();
  const translationTo = validateTranslationTarget(options.translationTo);
  let fileId: string | undefined;
  let transcriptionId: string | undefined;

  try {
    fileId = await uploadAudio(options, apiKey);
    transcriptionId = await createTranscription(fileId, translationTo, apiKey);
    await waitForTranscription(transcriptionId, apiKey);
    const transcript = await getTranscript(transcriptionId, apiKey);
    return {
      text: transcript.translation || transcript.sourceText,
      sourceText: transcript.sourceText || transcript.translation || "",
      ...(transcript.translation ? { translation: transcript.translation } : {}),
    };
  } finally {
    if (transcriptionId) {
      await deleteRemoteResource(`/transcriptions/${encodeURIComponent(transcriptionId)}`, apiKey);
    }
    if (fileId) {
      await deleteRemoteResource(`/files/${encodeURIComponent(fileId)}`, apiKey);
    }
  }
}