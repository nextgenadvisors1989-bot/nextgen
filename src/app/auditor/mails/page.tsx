import { Mail } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { MailCenter } from "@/components/modules/MailCenter";

export default function Page() {
  return (
    <PageTemplate title="Mail Center" subtitle="Inbox and outgoing messages" icon={Mail}>
      <MailCenter />
    </PageTemplate>
  );
}
