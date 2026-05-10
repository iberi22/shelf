import { GoogleGenAI } from '@google/genai';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import Stripe from 'stripe';

admin.initializeApp();
const db = admin.firestore();

// Per guidelines, the API key must be in process.env.API_KEY
// In Cloud Functions, this is set as a runtime environment variable.
if (!process.env.API_KEY) {
  throw new Error('Gemini API Key not found in environment variable API_KEY.');
}
// Initialize Stripe with secret key and webhook secret from environment variables
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Stripe secret key not found in environment variables.');
}
if (!process.env.STRIPE_WEBHOOK_SECRET) {
  throw new Error('Stripe webhook secret not found in environment variables.');
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET as string;

// Initialize GoogleGenAI with the API key from environment variables.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

const cors = (request: functions.https.Request, response: functions.Response) => {
  response.set('Access-Control-Allow-Origin', '*');
  response.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (request.method === 'OPTIONS') {
    response.status(204).send('');
    return true;
  }
  return false;
};

const verifyToken = async (authorization: string | undefined): Promise<admin.auth.DecodedIdToken | null> => {
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }
  const idToken = authorization.split('Bearer ')[1];
  try {
    return await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return null;
  }
};

export const chat = functions.https.onRequest(
  async (request: functions.https.Request, response: functions.Response) => {
    if (cors(request, response)) return;

    if (request.method !== 'POST') {
      response.status(405).send('Method Not Allowed');
      return;
    }

    const decodedToken = await verifyToken(request.headers.authorization);
    if (!decodedToken) {
      response.status(403).send('Unauthorized: Invalid token.');
      return;
    }

    try {
      const { prompt, inventoryData } = request.body;
      if (!prompt) {
        response.status(400).send({ error: 'Prompt is required.' });
        return;
      }

      const systemInstruction = `You are an expert inventory and sales analyst for a small business.
Your name is 'StockBot'. You will receive data in JSON format about the user's products and recent sales.
Your task is to answer questions and provide insights based *only* on the provided data.
- Be concise and to the point.
- If a question cannot be answered with the given data, state that clearly.
- Format your answers in simple markdown.
- NEVER invent or assume data that is not present in the context.
- Start your first response by introducing yourself as StockBot.`;

      const dataContext = JSON.stringify(inventoryData, null, 2);
      const fullPrompt = `Here is the current business data:\n\`\`\`json\n${dataContext}\n\`\`\`\n\nBased on the data above, please answer the following question: "${prompt}"`;

      const geminiResponse = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: fullPrompt,
        config: { systemInstruction, temperature: 0.2 },
      });

      const text = geminiResponse.text;
      response.status(200).send({ text });
    } catch (error) {
      console.error('Error calling Gemini API:', error);
      response.status(500).send({ error: 'Failed to get response from AI.' });
    }
  },
);

export const createCheckoutSession = functions.https.onRequest(async (request, response) => {
  if (cors(request, response)) return;

  const decodedToken = await verifyToken(request.headers.authorization);
  if (!decodedToken) {
    response.status(403).send('Unauthorized: Invalid token.');
    return;
  }

  const { planId, returnUrl } = request.body;
  const { uid } = decodedToken;

  // IMPORTANT: Replace these with your actual Price IDs from your Stripe Dashboard.
  // See docs/STRIPE_SETUP.md for instructions.
  const priceIds: Record<string, string> = {
    pro: 'YOUR_PRO_PLAN_PRICE_ID',
    pyme: 'YOUR_PYME_PLAN_PRICE_ID',
  };

  const priceId = priceIds[planId];
  if (!priceId || priceId.startsWith('YOUR_')) {
    response.status(400).send({ error: 'Invalid plan ID or Price ID not configured.' });
    return;
  }

  try {
    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${returnUrl}?checkout_status=success`,
      cancel_url: `${returnUrl}?checkout_status=cancel`,
      client_reference_id: uid, // Link session to Firebase user
      metadata: { planId }, // Pass planId to the webhook
    });

    response.status(200).send({ url: session.url });
  } catch (error) {
    console.error('Error creating Stripe checkout session:', error);
    response.status(500).send({ error: 'Could not create checkout session.' });
  }
});

export const extractInvoice = functions.https.onRequest(
  async (request: functions.https.Request, response: functions.Response) => {
    if (cors(request, response)) return;

    if (request.method !== 'POST') {
      response.status(405).send('Method Not Allowed');
      return;
    }

    const decodedToken = await verifyToken(request.headers.authorization);
    if (!decodedToken) {
      response.status(403).send({ error: 'Unauthorized' });
      return;
    }

    try {
      // Verify Pro subscription
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      const tier = userDoc.data()?.subscriptionTier;
      if (tier !== 'pro' && tier !== 'pyme') {
        response.status(403).send({ error: 'Pro subscription required for invoice OCR' });
        return;
      }

      const { imageBase64, mimeType, existingProducts } = request.body;

      if (!imageBase64 || !mimeType) {
        response.status(400).send({ error: 'imageBase64 and mimeType are required' });
        return;
      }

      // Remove data URI prefix if present (e.g., "data:image/jpeg;base64,")
      const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

      const systemInstruction = `You are an invoice data extraction specialist.
Your task is to extract structured data from invoice images, including handwritten invoices.
Be precise with numbers and totals. Extract all line items accurately.
Match items to existing products when possible based on description similarity.
Return data as valid JSON.`;

      const extractionPrompt = `Extract invoice data from this image and return ONLY valid JSON (no markdown, no code blocks) with this exact schema:
{
  "supplierName": "string or null",
  "invoiceNumber": "string or null",
  "invoiceDate": "YYYY-MM-DD or null",
  "items": [
    {
      "description": "string",
      "quantity": number,
      "unitPrice": number,
      "total": number,
      "confidence": number (0-1)
    }
  ],
  "subtotal": number or null,
  "tax": number or null,
  "total": number
}
${existingProducts && existingProducts.length > 0 ? `\nExisting products for matching: ${JSON.stringify(existingProducts.slice(0, 20))}` : ''}`;

      const geminiResponse = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType,
            },
          },
          extractionPrompt,
        ],
        config: {
          systemInstruction,
          temperature: 0.1,
        },
      });

      const responseText = (geminiResponse.text ?? '').trim();
      if (!responseText) {
        console.error('Gemini response text was empty:', geminiResponse);
        response.status(500).send({ error: 'Failed to extract invoice data from image' });
        return;
      }

      // Parse JSON - handle potential markdown code blocks
      let extractedData: any;
      try {
        // Try to extract JSON from markdown code blocks if present
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || responseText.match(/({[\s\S]*})/);
        const jsonStr = jsonMatch ? jsonMatch[1] : responseText;
        extractedData = JSON.parse(jsonStr);
      } catch {
        console.error('Failed to parse Gemini response:', responseText);
        response.status(500).send({ error: 'Failed to parse invoice data from image' });
        return;
      }

      response.status(200).send({
        success: true,
        extractedData,
        rawResponse: responseText,
      });
    } catch (error) {
      console.error('Invoice extraction error:', error);
      response.status(500).send({ error: 'Failed to extract invoice data' });
    }
  },
);

export const stripeWebhook = functions.https.onRequest(async (request, response) => {
  const sig = request.headers['stripe-signature'] as string;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(request.rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed.', err.message);
    response.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // Handle the checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id;
    const planId = session.metadata?.planId;

    if (!userId || !planId) {
      console.error('Webhook missing userId or planId in metadata', session);
      response.status(400).send('Webhook Error: Missing required metadata.');
      return;
    }

    try {
      const userRef = db.collection('users').doc(userId);
      await userRef.update({ subscriptionTier: planId });
      console.log(`Successfully updated subscription for user ${userId} to ${planId}`);
    } catch (error) {
      console.error('Error updating user subscription in Firestore:', error);
      response.status(500).send('Internal Server Error while updating user.');
      return;
    }
  }

  response.status(200).send({ received: true });
});
