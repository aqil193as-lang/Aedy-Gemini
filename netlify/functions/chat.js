// netlify/functions/chat.js
// Secure server-side proxy to Google Gemini API.
// The API key NEVER touches the browser - it only lives here as an
// environment variable (GEMINI_API_KEY) set in Netlify's dashboard.

const { GoogleGenerativeAI } = require("@google/generative-ai");

const DEFAULT_PERSONALITY =
  "You are Aedy Gemini, a helpful, sharp and friendly AI assistant built by Aedy. " +
  "Answer clearly and concisely. Use Markdown and code blocks when useful.";

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
  const trimmedMessages = messages.slice(-MAX_MESSAGES).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content || "").slice(0, MAX_CHARS) }],
  }));

  const systemInstruction = String(personality || DEFAULT_PERSONALITY).slice(0, 4000);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction,
    });

    const history = trimmedMessages.slice(0, -1);
    const lastMessage = trimmedMessages[trimmedMessages.length - 1];

    const chat = model.startChat({
      history,
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 2048,
      },
    });

    const result = await chat.sendMessage(lastMessage.parts[0].text);
    const text = result.response.text();

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
