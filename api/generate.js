function platformHint(p) {
  if (p === "LinkedIn") return "Keep under 300 chars.";
  if (p === "WhatsApp" || p === "WeChat") return "Keep conversational and brief.";
  return "Start with: Subject: [subject line]\n\nThen the email body.";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { mode, url, jobTitle, company, tone, platform, language, extraNotes, resumeBase64 } = req.body;

  if (!jobTitle) {
    return res.status(400).json({ error: "Job title is required." });
  }
  if (mode === "url" && !url) {
    return res.status(400).json({ error: "URL is required." });
  }
  if (mode === "resume" && !resumeBase64) {
    return res.status(400).json({ error: "Resume PDF is required." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured." });
  }

  try {
    const parts = [];

    if (mode === "url") {
      const prompt = `Analyze this profile/page: ${url}\n\nExtract professional info (name, role, skills, projects, experience), then write a ${tone.toLowerCase()} ${platform} outreach message for the role of "${jobTitle}"${company ? ` at ${company}` : ""}.${extraNotes ? `\nRecruiter notes: ${extraNotes}` : ""}\n${platformHint(platform)}\nWrite the message in ${language}. Write only the outreach message, nothing else.`;
      parts.push({ text: prompt });
    } else {
      const prompt = `You are an expert tech recruiter. Based on the attached resume, write a ${tone.toLowerCase()} ${platform} outreach message for the role of "${jobTitle}"${company ? ` at ${company}` : ""}.${extraNotes ? `\nRecruiter notes: ${extraNotes}` : ""}\n- Personalize with specific details. Highlight fit. Include a call-to-action.\n${platformHint(platform)}\nWrite the message in ${language}. Write only the message.`;
      parts.push(
        { inlineData: { mimeType: "application/pdf", data: resumeBase64 } },
        { text: prompt },
      );
    }

    const body = {
      contents: [{ role: "user", parts }],
      tools: mode === "url" ? [{ googleSearch: {} }] : undefined,
    };

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (data.error) {
      return res.status(response.status).json({ error: data.error.message });
    }

    const message = data.candidates?.[0]?.content?.parts
      ?.filter((p) => p.text)
      .map((p) => p.text)
      .join("\n")
      .trim();

    if (!message) {
      return res.status(500).json({ error: "No response generated." });
    }

    return res.status(200).json({ message });
  } catch (e) {
    return res.status(500).json({ error: "Failed to generate message: " + e.message });
  }
}
