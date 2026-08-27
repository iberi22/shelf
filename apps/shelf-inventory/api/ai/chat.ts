import { aiChatRateLimiter, buildRateLimitHeaders, type RateLimitResult, resolveChatClientKey } from '../../lib/aiChat';

export const config = {
  runtime: 'edge',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req: Request): Promise<Response> {
  // Preflight: never consumes rate-limit quota, only reports the current budget.
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: { ...CORS_HEADERS, ...buildRateLimitHeaders(aiChatRateLimiter.peek(resolveChatClientKey(req))) },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // 1. Sliding-window rate limiting (SHELF-106): 30 req/min per user
  //    (localAuth session token via Authorization: Bearer, falling back to IP).
  const clientKey = resolveChatClientKey(req);
  const rateLimit: RateLimitResult = aiChatRateLimiter.check(clientKey);
  // Every response carries X-RateLimit-Limit / X-RateLimit-Remaining / X-RateLimit-Reset.
  const baseHeaders: Record<string, string> = {
    ...CORS_HEADERS,
    ...buildRateLimitHeaders(rateLimit),
  };

  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({
        error: 'Too Many Requests',
        retryAfter: rateLimit.retryAfterSeconds,
      }),
      {
        status: 429,
        headers: {
          ...baseHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  // 2. Payload size cap (e.g., 50KB)
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > 50000) {
    return new Response(JSON.stringify({ error: 'Payload Too Large' }), {
      status: 413,
      headers: { ...baseHeaders, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY is not configured on the server.');
    return new Response(
      JSON.stringify({
        error: 'Service Unavailable',
      }),
      {
        status: 503,
        headers: { ...baseHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  try {
    const bodyText = await req.text();
    if (bodyText.length > 50000) {
      return new Response(JSON.stringify({ error: 'Payload Too Large' }), {
        status: 413,
        headers: { ...baseHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = JSON.parse(bodyText);

    if (!body || typeof body !== 'object') {
      return new Response(JSON.stringify({ error: 'Bad Request: Invalid JSON body' }), {
        status: 400,
        headers: { ...baseHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Input Validation
    if (!body.messages && !body.prompt) {
      return new Response(JSON.stringify({ error: 'Bad Request: Missing messages or prompt' }), {
        status: 400,
        headers: { ...baseHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check reasonable lengths
    if (body.prompt && typeof body.prompt === 'string' && body.prompt.length > 20000) {
      return new Response(JSON.stringify({ error: 'Bad Request: Prompt too long' }), {
        status: 400,
        headers: { ...baseHeaders, 'Content-Type': 'application/json' },
      });
    }

    const model = body.model || process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat';

    const messages = body.messages || [
      {
        role: 'system',
        content: body.systemPrompt || 'You are an inventory analyst and assistant for Shelf app.',
      },
      {
        role: 'user',
        content: body.inventoryData
          ? `Context Data: ${JSON.stringify(body.inventoryData)}\n\nUser Question: ${body.prompt}`
          : body.prompt || '',
      },
    ];

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://shelf.swal.co',
        'X-Title': 'Shelf Inventory',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: body.temperature ?? 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', response.status, errorText);
      return new Response(JSON.stringify({ error: 'Service Error' }), {
        status: response.status,
        headers: { ...baseHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || 'No response from AI model.';

    return new Response(
      JSON.stringify({
        text,
        model: data.model || model,
        choices: data.choices || [
          {
            message: {
              role: 'assistant',
              content: text,
            },
          },
        ],
      }),
      {
        status: 200,
        headers: { ...baseHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('Error handling /api/ai/chat:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
      }),
      {
        status: 500,
        headers: { ...baseHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
}
