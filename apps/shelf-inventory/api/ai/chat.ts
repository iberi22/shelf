export const config = {
  runtime: 'edge',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Simple token bucket rate limiter for the edge runtime
const rateLimitCache = new Map<string, { tokens: number; lastRefill: number }>();
const RATE_LIMIT_MAX_TOKENS = 10;
const RATE_LIMIT_REFILL_RATE = 10000; // 1 token every 10 seconds

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let bucket = rateLimitCache.get(ip);
  if (!bucket) {
    bucket = { tokens: RATE_LIMIT_MAX_TOKENS, lastRefill: now };
    rateLimitCache.set(ip, bucket);
  } else {
    const elapsed = now - bucket.lastRefill;
    if (elapsed > 0) {
      const tokensToAdd = elapsed / RATE_LIMIT_REFILL_RATE;
      bucket.tokens = Math.min(RATE_LIMIT_MAX_TOKENS, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // 1. Rate Limiting
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'unknown';
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
      status: 429,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // 2. Payload size cap (e.g., 50KB)
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > 50000) {
    return new Response(JSON.stringify({ error: 'Payload Too Large' }), {
      status: 413,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
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
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    );
  }

  try {
    const bodyText = await req.text();
    if (bodyText.length > 50000) {
      return new Response(JSON.stringify({ error: 'Payload Too Large' }), {
        status: 413,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const body = JSON.parse(bodyText);

    if (!body || typeof body !== 'object') {
      return new Response(JSON.stringify({ error: 'Bad Request: Invalid JSON body' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 3. Input Validation
    if (!body.messages && !body.prompt) {
      return new Response(JSON.stringify({ error: 'Bad Request: Missing messages or prompt' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Check reasonable lengths
    if (body.prompt && typeof body.prompt === 'string' && body.prompt.length > 20000) {
      return new Response(JSON.stringify({ error: 'Bad Request: Prompt too long' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
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
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
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
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
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
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    );
  }
}
