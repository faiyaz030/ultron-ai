export const providers = ["gemini"] as const;
export type Provider = (typeof providers)[number];

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatRequest = {
  provider: Provider;
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
};

export type ChatResult = {
  provider: Provider;
  model: string;
  content: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

type UpstreamJson = Record<string, unknown>;

const DEFAULT_MODELS: Record<Provider, string> = {
  gemini: "gemini-2.5-flash",
};

const UPSTREAM_TIMEOUT_MS = 45_000;

function configured(provider: Provider): boolean {
  return Boolean(process.env[`${provider.toUpperCase()}_API_KEY`]);
}

export function providerStatuses(): Array<{
  provider: Provider;
  configured: boolean;
  defaultModel: string;
}> {
  return providers.map((provider) => ({
    provider,
    configured: configured(provider),
    defaultModel: DEFAULT_MODELS[provider],
  }));
}

function getErrorMessage(body: UpstreamJson): string {
  const error = body["error"];

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string") {
      return message;
    }
  }

  return "Provider request failed.";
}

async function readJson(response: Response): Promise<UpstreamJson> {
  const body: unknown = await response.json().catch(() => ({}));

  return body && typeof body === "object"
    ? (body as UpstreamJson)
    : {};
}

async function callWithTimeout(
  url: string,
  init: RequestInit,
): Promise<{ response: Response; body: UpstreamJson }> {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    UPSTREAM_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    const body = await readJson(response);

    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}

function providerError(
  provider: Provider,
  response: Response,
  body: UpstreamJson,
): Error {
  const error = new Error(getErrorMessage(body));

  Object.assign(error, {
    code: "provider_error",
    provider,
    status: response.status,
  });

  return error;
}

async function callGemini(
  request: ChatRequest,
): Promise<ChatResult> {
  const key = process.env["GEMINI_API_KEY"];

  if (!key) {
    throw new Error("Provider gemini is not configured.");
  }

  const model = request.model ?? DEFAULT_MODELS.gemini;

  const system = request.messages.find(
    (message) => message.role === "system",
  );

  const contents = request.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [
        {
          text: message.content,
        },
      ],
    }));

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  const { response, body } = await callWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...(system
        ? {
            systemInstruction: {
              parts: [
                {
                  text: system.content,
                },
              ],
            },
          }
        : {}),

      contents,

      generationConfig: {
        ...(request.temperature === undefined
          ? {}
          : {
              temperature: request.temperature,
            }),

        ...(request.maxTokens === undefined
          ? {}
          : {
              maxOutputTokens: request.maxTokens,
            }),
      },
    }),
  });

  if (!response.ok) {
    throw providerError("gemini", response, body);
  }

  const candidates = body["candidates"];

  const first =
    Array.isArray(candidates)
      ? candidates[0]
      : undefined;

  const content =
    first && typeof first === "object"
      ? first["content"]
      : undefined;

  const parts =
    content && typeof content === "object"
      ? content["parts"]
      : undefined;

  const text =
    Array.isArray(parts)
      ? parts
          .map((part) =>
            part &&
            typeof part === "object" &&
            typeof part["text"] === "string"
              ? part["text"]
              : "",
          )
          .join("")
      : "";

  return {
    provider: "gemini",
    model,
    content: text,
  };
}

export async function generateChat(
  request: ChatRequest,
): Promise<ChatResult> {
  if (!configured(request.provider)) {
    throw new Error(
      `Provider ${request.provider} is not configured.`,
    );
  }

  switch (request.provider) {
    case "gemini":
      return callGemini(request);
  }
                  }
