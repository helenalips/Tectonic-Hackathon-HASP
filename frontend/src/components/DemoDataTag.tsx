import { FlaskConical } from "lucide-react";
import { Tag } from "./Tag";

/** Shown on every client header: internal facts in this PoC are fictional. */
export function DemoDataTag() {
  return (
    <Tag tone="neutral" icon={FlaskConical} title="Client names are real. Internal facts, people and documents are fictional.">
      Demo data
    </Tag>
  );
}
