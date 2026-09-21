import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { apiError, apiResponse } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface MailMessage {
  id: number;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

const demoMessages: MailMessage[] = [
  {
    id: 1,
    fromName: "ComplianceHub System",
    fromEmail: "system@compliancehub.com",
    subject: "Payroll run is ready for review",
    body: "Your payroll summary for this cycle has been finalized and is ready for confirmation.",
    isRead: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    fromName: "HR Operations",
    fromEmail: "hr@compliancehub.com",
    subject: "Document verification update",
    body: "The uploaded identity and compliance documents have been reviewed successfully.",
    isRead: true,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);

    return apiResponse({ messages: demoMessages });
  } catch (error) {
    console.error("Mail fetch error:", error);
    return apiError("Failed to fetch mail", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);

    const body = await request.json();
    const recipient = String(body.to || "").trim();
    const subject = String(body.subject || "").trim();
    const message = String(body.message || "").trim();

    if (!recipient || !subject || !message) {
      return apiError("To, subject and message are required", 400);
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(recipient)) {
      return apiError("Please enter a valid email address", 400);
    }

    const newMessage: MailMessage = {
      id: Date.now(),
      fromName: "You",
      fromEmail: authUser.email,
      subject,
      body: message,
      isRead: true,
      createdAt: new Date().toISOString(),
    };

    demoMessages.unshift({
      ...newMessage,
      fromName: "You",
      fromEmail: recipient,
      body: `To: ${recipient}\n\n${message}`,
    });

    return apiResponse({ message: newMessage, recipient });
  } catch (error) {
    console.error("Mail send error:", error);
    return apiError("Failed to send mail", 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);

    const body = await request.json();
    const id = Number(body.id);
    if (!id) return apiError("Mail id is required", 400);

    const msg = demoMessages.find((item) => item.id === id);
    if (msg) {
      msg.isRead = true;
    }

    return apiResponse({ updated: true, id });
  } catch (error) {
    console.error("Mail read update error:", error);
    return apiError("Failed to update mail", 500);
  }
}
