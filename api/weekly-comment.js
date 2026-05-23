export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const comment = await generateWeeklyComment(request.body ?? {});
    response.status(200).json({ comment });
  } catch (error) {
    console.error(error);
    response.status(error.statusCode ?? 500).json({ error: error.message || "Server error" });
  }
}

async function generateWeeklyComment(body) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error("OPENAI_API_KEYが未設定です。VercelのEnvironment Variablesに設定してください。");
    error.statusCode = 501;
    throw error;
  }

  const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      max_output_tokens: 260,
      input: [
        {
          role: "developer",
          content:
            "You are a gentle Japanese health journaling assistant. Give supportive weekly reflection based only on the provided self-tracking data. Do not diagnose, prescribe, shame, or give medical certainty. Mention uncertainty when data is sparse. Keep it concise: 3 to 5 Japanese sentences.",
        },
        {
          role: "user",
          content: JSON.stringify(body.summary ?? body),
        },
      ],
    }),
  });

  const result = await openAiResponse.json();
  if (!openAiResponse.ok) {
    const error = new Error(result.error?.message || "OpenAI API request failed.");
    error.statusCode = openAiResponse.status;
    throw error;
  }

  const text = extractOutputText(result);
  if (!text) throw new Error("OpenAI APIからコメント本文を取得できませんでした。");
  return text.trim();
}

function extractOutputText(result) {
  if (typeof result.output_text === "string") return result.output_text;

  return (result.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? "")
    .join("")
    .trim();
}
