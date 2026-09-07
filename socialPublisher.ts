// services/socialPublisher.ts — Platform API integrations

import { SocialPost, SocialAccount } from "@prisma/client";

type PublishResult = { postId: string; url: string };
type PostWithAccount = SocialPost & { account: SocialAccount };

// ─────────────────────────────────────────────────────────
// Main publisher — routes to correct platform
// ─────────────────────────────────────────────────────────
export const socialPublisher = {
  async publish(post: PostWithAccount): Promise<PublishResult> {
    switch (post.platform) {
      case "x_twitter":        return publishToX(post);
      case "facebook":         return publishToFacebook(post);
      case "instagram":        return publishToInstagram(post);
      case "telegram":         return publishToTelegram(post);
      case "whatsapp_channel": return publishToWhatsApp(post);
      case "linkedin":         return publishToLinkedIn(post);
      case "threads":          return publishToThreads(post);
      case "youtube":          return publishToYouTube(post);
      default:
        throw new Error(`Unknown platform: ${post.platform}`);
    }
  },
};

// ─────────────────────────────────────────────────────────
// X / Twitter API v2
// ─────────────────────────────────────────────────────────
async function publishToX(post: PostWithAccount): Promise<PublishResult> {
  const token = post.account.accessToken;
  if (!token) throw new Error("X: No access token");

  const body: Record<string, unknown> = { text: post.content };

  // Attach media if any
  if (post.mediaUrls.length > 0) {
    body.media = { media_ids: post.mediaUrls }; // Pre-uploaded media IDs
  }

  const res = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`X API error: ${JSON.stringify(err)}`);
  }

  const data = await res.json() as { data: { id: string } };
  const postId = data.data.id;
  const username = post.account.username || "gyanvarta";

  return {
    postId,
    url: `https://x.com/${username}/status/${postId}`,
  };
}

// ─────────────────────────────────────────────────────────
// Facebook Graph API
// ─────────────────────────────────────────────────────────
async function publishToFacebook(post: PostWithAccount): Promise<PublishResult> {
  const token = post.account.accessToken;
  const pageId = post.account.accountId;
  if (!token || !pageId) throw new Error("Facebook: Missing token or page ID");

  const params = new URLSearchParams({
    message: post.content,
    access_token: token,
  });

  if (post.mediaUrls[0]) {
    params.append("link", post.mediaUrls[0]);
  }

  const res = await fetch(
    `https://graph.facebook.com/v18.0/${pageId}/feed`,
    { method: "POST", body: params }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Facebook API error: ${JSON.stringify(err)}`);
  }

  const data = await res.json() as { id: string };
  return {
    postId: data.id,
    url: `https://facebook.com/${data.id}`,
  };
}

// ─────────────────────────────────────────────────────────
// Instagram Graph API (via Facebook)
// Note: Requires Business account + approved permissions
// ─────────────────────────────────────────────────────────
async function publishToInstagram(post: PostWithAccount): Promise<PublishResult> {
  const token = post.account.accessToken;
  const igUserId = post.account.accountId;
  if (!token || !igUserId) throw new Error("Instagram: Missing credentials");

  // Step 1: Create media container
  const mediaRes = await fetch(
    `https://graph.facebook.com/v18.0/${igUserId}/media`,
    {
      method: "POST",
      body: new URLSearchParams({
        caption: post.content,
        image_url: post.mediaUrls[0] || "",
        access_token: token,
      }),
    }
  );

  if (!mediaRes.ok) throw new Error("Instagram: Media container creation failed");
  const media = await mediaRes.json() as { id: string };

  // Step 2: Publish the container
  const publishRes = await fetch(
    `https://graph.facebook.com/v18.0/${igUserId}/media_publish`,
    {
      method: "POST",
      body: new URLSearchParams({
        creation_id: media.id,
        access_token: token,
      }),
    }
  );

  if (!publishRes.ok) throw new Error("Instagram: Publish failed");
  const published = await publishRes.json() as { id: string };

  return {
    postId: published.id,
    url: `https://instagram.com/p/${published.id}`,
  };
}

// ─────────────────────────────────────────────────────────
// Telegram Bot API
// ─────────────────────────────────────────────────────────
async function publishToTelegram(post: PostWithAccount): Promise<PublishResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const channelId = post.account.accountId; // e.g. "@gyanvarta"
  if (!token || !channelId) throw new Error("Telegram: Missing bot token or channel ID");

  const body: Record<string, unknown> = {
    chat_id: channelId,
    text: post.content,
    parse_mode: "Markdown",
  };

  // Add image if available
  if (post.mediaUrls[0]) {
    const photoRes = await fetch(
      `https://api.telegram.org/bot${token}/sendPhoto`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: channelId,
          photo: post.mediaUrls[0],
          caption: post.content,
          parse_mode: "Markdown",
        }),
      }
    );
    const photoData = await photoRes.json() as { ok: boolean; result: { message_id: number } };
    if (photoData.ok) {
      return {
        postId: String(photoData.result.message_id),
        url: `https://t.me/${channelId.replace("@", "")}/${photoData.result.message_id}`,
      };
    }
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json() as { ok: boolean; result: { message_id: number } };
  if (!data.ok) throw new Error("Telegram: sendMessage failed");

  return {
    postId: String(data.result.message_id),
    url: `https://t.me/${channelId.replace("@", "")}/${data.result.message_id}`,
  };
}

// ─────────────────────────────────────────────────────────
// WhatsApp Business API
// ─────────────────────────────────────────────────────────
async function publishToWhatsApp(post: PostWithAccount): Promise<PublishResult> {
  const token = process.env.WHATSAPP_API_KEY;
  const phoneId = post.account.accountId;
  if (!token || !phoneId) throw new Error("WhatsApp: Missing credentials");

  const body = {
    messaging_product: "whatsapp",
    to: post.account.username, // Channel number
    type: "text",
    text: { body: post.content },
  };

  const res = await fetch(
    `https://graph.facebook.com/v18.0/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`WhatsApp API error: ${JSON.stringify(err)}`);
  }

  const data = await res.json() as { messages: Array<{ id: string }> };
  return {
    postId: data.messages[0].id,
    url: `https://whatsapp.com/channel/${post.account.username}`,
  };
}

// ─────────────────────────────────────────────────────────
// LinkedIn API v2
// ─────────────────────────────────────────────────────────
async function publishToLinkedIn(post: PostWithAccount): Promise<PublishResult> {
  const token = post.account.accessToken;
  const personId = post.account.accountId;
  if (!token || !personId) throw new Error("LinkedIn: Missing credentials");

  const body = {
    author: `urn:li:person:${personId}`,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: post.content },
        shareMediaCategory: "NONE",
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };

  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`LinkedIn API error: ${JSON.stringify(err)}`);
  }

  const postId = res.headers.get("x-restli-id") || "";
  return {
    postId,
    url: `https://linkedin.com/feed/update/${postId}`,
  };
}

// ─────────────────────────────────────────────────────────
// Threads API
// ─────────────────────────────────────────────────────────
async function publishToThreads(post: PostWithAccount): Promise<PublishResult> {
  const token = post.account.accessToken;
  const userId = post.account.accountId;
  if (!token || !userId) throw new Error("Threads: Missing credentials");

  // Step 1: Create container
  const containerRes = await fetch(
    `https://graph.threads.net/v1.0/${userId}/threads`,
    {
      method: "POST",
      body: new URLSearchParams({
        text: post.content,
        media_type: "TEXT",
        access_token: token,
      }),
    }
  );
  const container = await containerRes.json() as { id: string };

  // Step 2: Publish
  const publishRes = await fetch(
    `https://graph.threads.net/v1.0/${userId}/threads_publish`,
    {
      method: "POST",
      body: new URLSearchParams({
        creation_id: container.id,
        access_token: token,
      }),
    }
  );
  const published = await publishRes.json() as { id: string };

  return {
    postId: published.id,
    url: `https://threads.net/@${post.account.username}/post/${published.id}`,
  };
}

// ─────────────────────────────────────────────────────────
// YouTube Community Post (Data API v3)
// ─────────────────────────────────────────────────────────
async function publishToYouTube(post: PostWithAccount): Promise<PublishResult> {
  const token = post.account.accessToken;
  if (!token) throw new Error("YouTube: No access token");

  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/communityPosts?part=snippet",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        snippet: {
          type: "textPost",
          textOriginalContent: post.content,
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`YouTube API error: ${JSON.stringify(err)}`);
  }

  const data = await res.json() as { id: string };
  return {
    postId: data.id,
    url: `https://youtube.com/post/${data.id}`,
  };
}
