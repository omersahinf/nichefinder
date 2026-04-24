import { Resend } from "resend";
import type { EnrichedVideo } from "./search-types";

const fmt = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
};

export async function sendAlertEmail(
  to: string,
  matches: EnrichedVideo[],
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY missing; alert email skipped");
    return false;
  }

  const from = process.env.RESEND_FROM || "onboarding@resend.dev";
  const resend = new Resend(apiKey);
  const top = matches.slice(0, 10);

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <h1>NicheFinder alert</h1>
      <p>${top.length} new matching video${top.length === 1 ? "" : "s"} found.</p>
      <ul>
        ${top
          .map(
            (video) => `
              <li>
                <a href="https://youtube.com/watch?v=${video.id}">${video.title}</a>
                <br />
                ${video.channelTitle} - ${fmt(video.views)} views - ${video.outlierScore.toFixed(1)}x outlier
              </li>
            `,
          )
          .join("")}
      </ul>
    </div>
  `;

  await resend.emails.send({
    from,
    to,
    subject: `NicheFinder alert: ${top.length} new videos`,
    html,
  });

  return true;
}
