export const config = {
  runtime: 'edge',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: 'OPENROUTER_API_KEY is not configured on the server.',
      }),
      {
        status: 503,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    );
  }

  try {
    const body = await req.json();
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
      return new Response(JSON.stringify({ error: `OpenRouter error: ${response.statusText}`, details: errorText }), {
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
        error: error instanceof Error ? error.message : 'Internal Server Error',
      }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    );
  }
}
