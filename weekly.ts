// agents/weekly.ts — Weekly Analytics AI Agent
import Anthropic from "@anthropic-ai/sdk";

const claude = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

type WeeklyInput = {
  topArticles: Array<{ title: string; views: number; type: string }>;
  socialMetrics: { posts: number; totalReach: number; totalEngagements: number; totalClicks: number };
  videoMetrics: { totalViews: number; watchTimeHours: number };
};

type WeeklyReport = {
  insights: string;
  editorialRecommendations: string[];
  socialRecommendations: string[];
  videoRecommendations: string[];
  nextWeekFocus: string[];
};

export async function weeklyAnalyticsAgent(data: WeeklyInput): Promise<WeeklyReport> {
  const res = await claude.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: `आप एक Media Analytics Expert हैं। Data से actionable Hindi editorial insights दें।
ONLY valid JSON उत्तर दें — कोई preamble नहीं।
Format:
{
  "insights": "3-4 sentences executive summary in Hindi",
  "editorialRecommendations": ["सुझाव 1", "सुझाव 2", "सुझाव 3"],
  "socialRecommendations": ["social सुझाव 1", "social सुझाव 2"],
  "videoRecommendations": ["video सुझाव 1", "video सुझाव 2"],
  "nextWeekFocus": ["priority 1", "priority 2", "priority 3"]
}`,
    messages: [
      {
        role: "user",
        content: `Weekly Analytics Data:

Top Articles (by views):
${data.topArticles.map((a, i) => `${i + 1}. "${a.title}" — ${a.views} views (${a.type})`).join("\n")}

Social Media:
- Total posts: ${data.socialMetrics.posts}
- Total reach: ${data.socialMetrics.totalReach}
- Engagements: ${data.socialMetrics.totalEngagements}
- Clicks to website: ${data.socialMetrics.totalClicks}

Video:
- Views: ${data.videoMetrics.totalViews}
- Watch time: ${data.videoMetrics.watchTimeHours} hours

इस data के आधार पर अगले सप्ताह के लिए recommendations दें।`,
      },
    ],
  });

  const text = (res.content[0] as { text: string }).text;
  const clean = text.replace(/```json\n?|\n?```/g, "").trim();
  return JSON.parse(clean) as WeeklyReport;
}
