import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { SolveInterviewQuestionBody } from "@workspace/api-zod";

const router: IRouter = Router();

const SYSTEM_PROMPT = `You are an expert software engineer and coding interview coach. You help candidates during technical coding interviews by providing clear, well-explained guidance.

When given a coding question, you respond based on the requested mode:
- "hint": Give a helpful hint to point the candidate in the right direction without revealing the full solution. Be concise but insightful.
- "solution": Provide a complete, well-commented, working solution in the requested language. Include time and space complexity at the end.
- "explain": Explain the approach and algorithm in plain English. Break it down step by step, then show the code.
- "complexity": Analyze the time and space complexity. Explain Big-O notation clearly with multiple approaches if relevant.

Always format code properly with correct syntax for the requested language. Be direct and concise.`;

router.post("/interview/solve", async (req, res) => {
  const parsed = SolveInterviewQuestionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { question, language, mode } = parsed.data;

  const modePrompts: Record<string, string> = {
    hint: `Give me a hint (NOT the full solution) for this ${language} coding problem:\n\n${question}`,
    solution: `Provide a complete, working ${language} solution for this coding problem:\n\n${question}\n\nInclude comments explaining key steps and end with time/space complexity analysis.`,
    explain: `Explain the approach and algorithm for solving this ${language} problem in plain English, then show the code:\n\n${question}`,
    complexity: `Analyze the time and space complexity for this ${language} problem. Discuss different approaches and their complexities:\n\n${question}`,
    say_it: `You are helping a non-technical person sound smart in a coding interview. For this problem, give EXACTLY 3 bullet points. Rules: NO code whatsoever. NO jargon. Each bullet is ONE short simple sentence (max 15 words). Write it so they can read it off a screen and say it out loud naturally right now. Think of it as a teleprompter script.\n\nProblem: ${question}\n\nFormat:\n• [sentence]\n• [sentence]\n• [sentence]`,
  };

  const userMessage = modePrompts[mode] ?? modePrompts.solution;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    console.error("Error calling OpenAI:", err);
    res.write(`data: ${JSON.stringify({ error: "Failed to get response from AI" })}\n\n`);
  }

  res.end();
});

export default router;
