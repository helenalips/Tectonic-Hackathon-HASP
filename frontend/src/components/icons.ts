import {
  CircleCheck,
  CircleX,
  CopyCheck,
  FileCheck,
  FileSignature,
  FileText,
  Handshake,
  Info,
  Link as LinkIcon,
  Mail,
  MapPin,
  OctagonAlert,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  StickyNote,
  Ticket,
  TriangleAlert,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { DocType } from "../api/types";

/** Maps the icon names used in theme/tokens.ts `status` onto lucide components. */
export const STATUS_ICON: Record<string, LucideIcon> = {
  "shield-check": ShieldCheck,
  "alert-triangle": TriangleAlert,
  "shield-alert": ShieldAlert,
  "octagon-alert": OctagonAlert,
  info: Info,
  link: LinkIcon,
  "copy-check": CopyCheck,
  "check-circle": CircleCheck,
  "x-circle": CircleX,
  "shield-x": ShieldX,
};

export const DOC_TYPE_ICON: Record<DocType, LucideIcon> = {
  email: Mail,
  meeting: Handshake,
  visit: MapPin,
  contract: FileSignature,
  onboarding: UserPlus,
  ticket: Ticket,
  note: StickyNote,
  policy: ScrollText,
  solution: FileCheck,
};

export const FallbackDocIcon = FileText;
