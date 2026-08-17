import { randomUUID } from "node:crypto";
import type { ComfyProviderConfig } from "./config.js";

export type ComfyJobRawStatus =
  | "submitted"
  | "queued"
  | "queued_limited"
  | "executing"
  | "success"
  | "error"
  | "non_retryable_error"
  | "lost"
  | "cancelled";

export interface ComfyJobStatus {
  status: ComfyJobRawStatus;
  /** Unparsed response body — carries `error_message` on a failed job. */
  raw: Record<string, unknown>;
}

const TERMINAL_STATUSES: ComfyJobRawStatus[] = [
  "success",
  "error",
  "non_retryable_error",
  "lost",
  "cancelled",
];

function authHeaders(config: ComfyProviderConfig): Record<string, string> {
  return { "X-API-Key": config.apiKey };
}

/** Submit an API-format workflow graph. Returns the prompt id to poll/download with. */
export async function submitWorkflow(
  config: ComfyProviderConfig,
  workflow: Record<string, unknown>,
): Promise<{ promptId: string }> {
  const res = await fetch(`${config.baseUrl}/api/prompt`, {
    method: "POST",
    headers: { ...authHeaders(config), "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!res.ok) {
    throw new Error(`Comfy Cloud rejected the workflow (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { prompt_id: string };
  return { promptId: data.prompt_id };
}

/** Point-in-time job status. Prefer {@link waitForJob} over polling this in a loop. */
export async function getJobStatus(
  config: ComfyProviderConfig,
  promptId: string,
): Promise<ComfyJobStatus> {
  const res = await fetch(`${config.baseUrl}/api/job/${promptId}/status`, {
    headers: authHeaders(config),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch Comfy Cloud job status (${res.status}): ${await res.text()}`);
  }
  const raw = (await res.json()) as Record<string, unknown>;
  return { status: raw.status as ComfyJobRawStatus, raw };
}

/**
 * Poll until the job reaches a terminal state, or `timeoutMs` elapses.
 * Z-Image-Turbo is an 8-step distilled model — normally done in a few
 * seconds — so a generous cap here is still cheap in the common case.
 */
export async function waitForJob(
  config: ComfyProviderConfig,
  promptId: string,
  { timeoutMs = 45_000, pollIntervalMs = 1500 }: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<ComfyJobStatus> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const status = await getJobStatus(config, promptId);
    if (TERMINAL_STATUSES.includes(status.status)) return status;
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for Comfy Cloud to finish generating the image.");
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

/**
 * A file produced by a finished job, as named in the `executed` event.
 */
export interface ComfyOutputRef {
  filename: string;
  subfolder?: string;
  type?: string;
}

function firstImage(output: unknown): ComfyOutputRef | undefined {
  const images = (output as { images?: unknown } | undefined)?.images;
  if (!Array.isArray(images)) return undefined;
  const first = images[0] as Record<string, unknown> | undefined;
  return typeof first?.filename === "string"
    ? {
        filename: first.filename,
        subfolder: typeof first.subfolder === "string" ? first.subfolder : undefined,
        type: typeof first.type === "string" ? first.type : undefined,
      }
    : undefined;
}

/**
 * Submit a workflow and resolve with its output file.
 *
 * The REST status endpoint reports only `success`/`error` — it never carries
 * the output filename. Comfy Cloud emits that solely through the `/ws`
 * `executed` event, and exposes no `/history`-style REST equivalent, so the
 * socket is the only way to learn what to download. It is opened *before*
 * submitting, since a distilled 8-step model can finish before a
 * later-connecting listener would be attached.
 *
 * Status polling still runs alongside it, purely to fail fast: a workflow
 * rejected during server-side validation never starts executing, so it emits
 * no `execution_error` frame and would otherwise stall until the timeout. The
 * poller never resolves the success path — that is the socket's job.
 */
export async function runWorkflow(
  config: ComfyProviderConfig,
  workflow: Record<string, unknown>,
  { timeoutMs = 120_000 }: { timeoutMs?: number } = {},
): Promise<ComfyOutputRef> {
  const wsUrl = new URL("/ws", config.baseUrl);
  wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
  wsUrl.searchParams.set("clientId", randomUUID());
  wsUrl.searchParams.set("token", config.apiKey);

  const socket = new WebSocket(wsUrl);

  try {
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("Could not open a Comfy Cloud websocket.")),
        { once: true },
      );
    });

    const { promptId } = await submitWorkflow(config, workflow);

    const fromSocket = new Promise<ComfyOutputRef>((resolve, reject) => {
      socket.addEventListener("message", (event) => {
        // Binary frames are live preview images — not the finished output.
        if (typeof event.data !== "string") return;

        let message: { type?: string; data?: Record<string, unknown> };
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (message.data?.prompt_id !== promptId) return;

        if (message.type === "executed") {
          const output = firstImage(message.data.output);
          if (output) resolve(output);
          return;
        }
        if (message.type === "execution_error") {
          reject(
            new Error(`Comfy Cloud failed to execute the workflow: ${JSON.stringify(message.data)}`),
          );
        }
      });
    });

    const failFast = waitForJob(config, promptId, { timeoutMs }).then(
      (status): Promise<never> =>
        status.status === "success"
          ? // Executed fine; let the socket deliver the filename.
            new Promise<never>(() => {})
          : Promise.reject(
              new Error(
                `Comfy Cloud generation did not succeed (status: ${status.status}). ` +
                  `Raw payload: ${JSON.stringify(status.raw)}`,
              ),
            ),
    );

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Timed out waiting for Comfy Cloud to finish generating the image.")),
        timeoutMs,
      ).unref(),
    );

    return await Promise.race([fromSocket, failFast, timeout]);
  } finally {
    socket.close();
  }
}

/**
 * Download a finished output. Follows the `/api/view` redirect to the signed
 * storage URL; per Comfy's docs that URL carries its own authorization, so the
 * API key is sent only on the first request.
 */
export async function downloadOutput(
  config: ComfyProviderConfig,
  output: ComfyOutputRef,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const params = new URLSearchParams({
    filename: output.filename,
    type: output.type || "output",
  });
  if (output.subfolder) params.set("subfolder", output.subfolder);

  const res = await fetch(`${config.baseUrl}/api/view?${params}`, {
    headers: authHeaders(config),
  });
  if (!res.ok) {
    throw new Error(`Failed to download Comfy Cloud output (${res.status}): ${await res.text()}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get("content-type") || "image/png";
  return { buffer, mimeType };
}
