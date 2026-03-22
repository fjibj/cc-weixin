/**
 * QR code login flow for WeChat iLink Bot.
 */

import qrcode from "qrcode-terminal";

interface QRCodeResult {
  qrcodeUrl?: string;
  qrcodeId: string;
  message: string;
}

interface LoginResult {
  connected: boolean;
  token?: string;
  accountId?: string;
  baseUrl?: string;
  userId?: string;
  message: string;
}

/** Step 1: Get QR code from server */
export async function startLogin(apiBaseUrl: string): Promise<QRCodeResult> {
  const resp = await fetch(`${apiBaseUrl}/ilink/bot/get_bot_qrcode?bot_type=3`);
  if (!resp.ok) {
    throw new Error(`Failed to get QR code: HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as { qrcode?: string; qrcode_img_content?: string };

  if (!data.qrcode) {
    throw new Error("No qrcode in response");
  }

  const qrcodeUrl = data.qrcode_img_content || "";

  // Display QR code in terminal
  if (qrcodeUrl) {
    qrcode.generate(qrcodeUrl, { small: true }, (output: string) => {
      process.stderr.write(output + "\n");
    });
  }

  return {
    qrcodeUrl,
    qrcodeId: data.qrcode,
    message: "Scan the QR code with WeChat to connect.",
  };
}

/** Step 2: Poll for scan result */
export async function waitForLogin(params: {
  qrcodeId: string;
  apiBaseUrl: string;
  timeoutMs?: number;
  maxRetries?: number;
}): Promise<LoginResult> {
  const { qrcodeId, apiBaseUrl, timeoutMs = 480000, maxRetries = 3 } = params;
  const deadline = Date.now() + timeoutMs;
  let currentQrcodeId = qrcodeId;
  let retryCount = 0;

  while (Date.now() < deadline) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      const resp = await fetch(
        `${apiBaseUrl}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(currentQrcodeId)}`,
        {
          headers: { "iLink-App-ClientVersion": "1" },
          signal: controller.signal,
        },
      );
      clearTimeout(timeout);

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const data = (await resp.json()) as {
        status?: string;
        bot_token?: string;
        ilink_bot_id?: string;
        baseurl?: string;
        ilink_user_id?: string;
      };

      switch (data.status) {
        case "confirmed":
          return {
            connected: true,
            token: data.bot_token,
            accountId: data.ilink_bot_id,
            baseUrl: data.baseurl,
            userId: data.ilink_user_id,
            message: "Connected to WeChat successfully!",
          };

        case "scaned":
          process.stderr.write("QR code scanned, waiting for confirmation...\n");
          break;

        case "expired":
          retryCount++;
          if (retryCount >= maxRetries) {
            return { connected: false, message: "QR code expired after maximum retries." };
          }
          process.stderr.write("QR code expired, refreshing...\n");
          const refreshed = await startLogin(apiBaseUrl);
          currentQrcodeId = refreshed.qrcodeId;
          break;

        case "wait":
        default:
          break;
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        // Long-poll timeout, retry
        continue;
      }
      throw err;
    }

    // Small delay between polls
    await new Promise((r) => setTimeout(r, 1000));
  }

  return { connected: false, message: "Login timed out." };
}
