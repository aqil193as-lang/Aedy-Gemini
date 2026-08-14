// netlify/functions/chat.js
// Secure server-side proxy to Google Gemini API.
// The API key NEVER touches the browser - it only lives here as an
// environment variable (GEMINI_API_KEY) set in Netlify's dashboard.
// Uses the Gemini REST API directly via fetch (no npm dependency needed).

const DEFAULT_PERSONALITY =
  "You are Aedy Gemini, a helpful, sharp and friendly AI assistant built by Aedy. " +
  "Answer clearly and concisely. Use Markdown and code blocks when useful.";

const MODEL = "gemini-2.0-flash";

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Gemini API is not configured. Please check the server environment variables.",
      }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Invalid request body." }),
    };
  }

  const { messages, personality } = payload;

  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "No messages provided." }),
    };
  }

  const MAX_MESSAGES = 60;
  const MAX_CHARS = 20000;
  const contents = messages.slice(-MAX_MESSAGES).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content || "").slice(0, MAX_CHARS) }],
  }));

  const systemInstruction = String(personality || DEFAULT_PERSONALITY).slice(0, 4000);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 2048,
        },
      }),
    });

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      console.error("Gemini API error response:", JSON.stringify(data));
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: "Sorry, Aedy Gemini couldn't generate a response right now. Please try again.",
        }),
      };
    }

    const text =
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;

    if (!text) {
      console.error("Unexpected Gemini response shape:", JSON.stringify(data));
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: "Sorry, Aedy Gemini couldn't generate a response right now. Please try again.",
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply: text }),
    };
  } catch (err) {
    console.error("Gemini API error:", err);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        error: "Sorry, Aedy Gemini couldn't generate a response right now. Please try again.",
      }),
    };
  }
};
